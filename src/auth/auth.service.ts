import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'

interface UserRecord {
  openid: string
  nickname: string
  avatar: string
  created_at: string
  last_login_at: string
}

/**
 * 用户存储：MVP 用 JSON 文件（云托管实例重启会丢，正式环境建议接数据库）
 * 文件放在容器可写的 /tmp 或项目 data 目录
 */
const DATA_FILE = path.join(process.cwd(), 'data', 'users.json')

function loadUsers(): Record<string, UserRecord> {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

function saveUsers(users: Record<string, UserRecord>) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2))
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  /** code → openid（调微信 jscode2session，AppSecret 只存在服务端） */
  async loginByCode(
    code: string
  ): Promise<{ openid: string | null; nickname?: string; avatar?: string; error?: string }> {
    const appid = process.env.WX_APPID
    const secret = process.env.WX_SECRET
    if (!appid || !secret) {
      this.logger.error('未配置 WX_APPID / WX_SECRET')
      return { openid: null, error: '服务端未配置微信登录' }
    }
    try {
      const url =
        'https://api.weixin.qq.com/sns/jscode2session' +
        `?appid=${appid}&secret=${secret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`
      const res = await fetch(url)
      const data = (await res.json()) as { openid?: string; errcode?: number; errmsg?: string }
      if (!data.openid) {
        this.logger.warn(`jscode2session 失败: ${data.errcode} ${data.errmsg}`)
        return { openid: null, error: `微信登录失败（${data.errcode}: ${data.errmsg}）` }
      }
      // 落库：不存在则建档
      const users = loadUsers()
      if (!users[data.openid]) {
        users[data.openid] = {
          openid: data.openid,
          nickname: '',
          avatar: '',
          created_at: new Date().toISOString(),
          last_login_at: new Date().toISOString()
        }
      } else {
        users[data.openid].last_login_at = new Date().toISOString()
      }
      saveUsers(users)
      const u = users[data.openid]
      return { openid: data.openid, nickname: u.nickname, avatar: u.avatar }
    } catch (e: any) {
      const msg = e?.cause?.code || e?.message || String(e)
      this.logger.error(`jscode2session 请求异常: ${msg}`)
      return { openid: null, error: `网络异常：${msg}` }
    }
  }

  /** 部署自检：报告 Node 版本、环境变量配置、外网连通性（仅用于排查部署问题） */
  async selfCheck() {
    const result: Record<string, any> = {
      node: process.version,
      has_fetch: typeof fetch === 'function',
      wx_appid_set: !!process.env.WX_APPID,
      wx_secret_set: !!process.env.WX_SECRET,
      wechat_api: '未测试'
    }
    try {
      const res = await fetch('https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=invalid&secret=invalid', { signal: AbortSignal.timeout(8000) })
      const data = await res.json()
      result.wechat_api = `可达（HTTP ${res.status}，微信应答正常）`
      void data
    } catch (e: any) {
      result.wechat_api = `不可达：${e?.cause?.code || e?.message || String(e)}`
    }
    return result
  }

  /** 保存头像昵称 */
  saveProfile(openid: string, profile: { nickname: string; avatar: string }) {
    const users = loadUsers()
    if (!users[openid]) {
      users[openid] = {
        openid,
        nickname: '',
        avatar: '',
        created_at: new Date().toISOString(),
        last_login_at: new Date().toISOString()
      }
    }
    if (profile.nickname) users[openid].nickname = profile.nickname
    if (profile.avatar) users[openid].avatar = profile.avatar
    saveUsers(users)
    return { ok: true }
  }
}
