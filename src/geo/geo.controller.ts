import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common'
import * as https from 'https'

/**
 * 逆地理编码：坐标 → 城市名
 * 放在服务端是因为小程序 request 合法域名白名单无法配置 nominatim，
 * 服务端调用不受白名单限制。
 * 云托管出网网关可能注入自签名证书，统一关闭校验（与微信 API 通道同理）。
 */
const OUTBOUND_AGENT = new https.Agent({ rejectUnauthorized: false })

function httpsGetJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent: OUTBOUND_AGENT, timeout: 8000, headers }, (res) => {
      let raw = ''
      res.on('data', (chunk) => (raw += chunk))
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw))
        } catch {
          reject(new Error(`返回非 JSON（HTTP ${res.statusCode}）`))
        }
      })
    })
    req.on('timeout', () => req.destroy(new Error('ETIMEDOUT')))
    req.on('error', reject)
  })
}

@Controller('api/geo')
export class GeoController {
  @Post('reverse')
  async reverse(
    @Body() body: { latitude?: number; longitude?: number },
    @Headers('x-outu-token') token?: string
  ) {
    const expected = process.env.API_TOKEN
    if (expected && token !== expected) {
      throw new UnauthorizedException({ error: '接口鉴权失败' })
    }
    const { latitude, longitude } = body || {}
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return { city: null, error: '缺少坐标' }
    }
    try {
      const url =
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
        `&lat=${latitude}&lon=${longitude}&accept-language=zh-CN&zoom=10`
      const data = await httpsGetJson(url, { 'User-Agent': 'outu-miniprogram/1.0 (travel assistant)' })
      const addr = data?.address || {}
      const city: string = addr.city || addr.town || addr.county || addr.state || ''
      return { city: city || null }
    } catch (e: any) {
      return { city: null, error: `逆地理编码失败：${e?.message || e}` }
    }
  }
}
