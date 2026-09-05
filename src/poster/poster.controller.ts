import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common'
import https from 'https'

/**
 * 云托管出网网关会注入自签名证书，直连微信 API 会报证书错误，
 * 必须走不校验证书的专用 agent（与 auth.service 同一原因）
 */
const wxAgent = new https.Agent({ rejectUnauthorized: false })

/** access_token 内存缓存（有效期 7200s，提前 5 分钟刷新） */
let tokenCache: { token: string; expireAt: number } | null = null

function wxGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { agent: wxAgent }, (res) => {
        let raw = ''
        res.on('data', (c) => (raw += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw))
          } catch {
            reject(new Error(`微信接口返回非 JSON（HTTP ${res.statusCode}）`))
          }
        })
      })
      .on('error', reject)
  })
}

function wxPostBuffer(url: string, payload: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload)
    const req = https.request(
      url,
      {
        method: 'POST',
        agent: wxAgent,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
      }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expireAt > Date.now()) return tokenCache.token
  const appid = process.env.WX_APPID
  const secret = process.env.WX_SECRET
  if (!appid || !secret) throw new Error('未配置 WX_APPID / WX_SECRET')
  const r = await wxGet(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`
  )
  if (!r?.access_token) throw new Error(`获取 access_token 失败：${r?.errmsg || '未知'}`)
  tokenCache = { token: r.access_token, expireAt: Date.now() + (r.expires_in - 300) * 1000 }
  return r.access_token
}

@Controller('api/poster')
export class PosterController {
  /**
   * 生成小程序码（getUnlimited）：返回 base64 PNG
   * 注意：小程序未发布时接口可能报 41030，前端需兜底（海报降级为无码版）
   */
  @Post('qrcode')
  async qrcode(
    @Body() body: { scene?: string; env_version?: 'release' | 'trial' | 'develop' },
    @Headers('x-outu-token') token?: string
  ) {
    const expected = process.env.API_TOKEN
    if (expected && token !== expected) {
      throw new UnauthorizedException({ ok: false, error: '接口鉴权失败' })
    }
    try {
      const accessToken = await getAccessToken()
      const buf = await wxPostBuffer(
        `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`,
        {
          scene: (body?.scene || 'share').slice(0, 32),
          page: 'pages/launch/launch',
          width: 280,
          check_path: false,
          env_version: body?.env_version || 'release'
        }
      )
      // 返回的是 JSON 说明出错了（正常应为 PNG 二进制）
      const head = buf.slice(0, 1).toString()
      if (head === '{') {
        const err = JSON.parse(buf.toString())
        return { ok: false, error: `小程序码生成失败（${err.errcode}: ${err.errmsg}）` }
      }
      return { ok: true, image: buf.toString('base64') }
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) }
    }
  }
}
