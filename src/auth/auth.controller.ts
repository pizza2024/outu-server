import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common'
import { AuthService } from './auth.service'

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 微信一键登录：code 换 openid */
  @Post('login')
  async login(
    @Headers('x-outu-token') token: string,
    @Body() body: { code?: string }
  ) {
    this.checkToken(token)
    if (!body?.code) return { openid: null, error: '缺少 code' }
    return this.authService.loginByCode(body.code)
  }

  /** 保存用户资料（头像/昵称，由前端 chooseAvatar + nickname 输入框采集） */
  @Post('profile')
  async saveProfile(
    @Headers('x-outu-token') token: string,
    @Body() body: { openid?: string; nickname?: string; avatar?: string }
  ) {
    this.checkToken(token)
    if (!body?.openid) return { ok: false, error: '缺少 openid' }
    return this.authService.saveProfile(body.openid, {
      nickname: body.nickname || '',
      avatar: body.avatar || ''
    })
  }

  private checkToken(token: string) {
    const expected = process.env.API_TOKEN
    if (expected && token !== expected) {
      throw new UnauthorizedException({ error: '接口鉴权失败' })
    }
  }
}
