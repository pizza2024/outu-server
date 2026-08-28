import { Injectable } from '@nestjs/common'
import { createAgent } from 'langchain'
import { ChatOpenAI } from '@langchain/openai'

/** PRD 3.3 核心原则（Agent 系统提示词，所有请求共享） */
const CORE_PRINCIPLES = `你是资深旅行规划专家。核心原则：
1. 以用户需求为绝对核心，不推荐与用户偏好冲突的内容
2. 路线规划遵循地理就近原则，减少无效往返
3. 时间安排合理，预留缓冲时间，不排满
4. 预算控制在用户指定范围内
5. 考虑季节性、天气、节假日因素
6. 优先推荐高评分、高口碑的POI
7. 对特殊人群（老人、儿童、孕妇）给予额外关照提示
8. 所有文本使用简体中文，精炼直给（每个文本字段不超过50字），时间用24小时制，价格用人民币
9. 只输出纯JSON，不要markdown代码块，不要任何额外解释`

const SCHEDULE_SCHEMA = `{
  "day": 数字, "date": "YYYY-MM-DD", "theme": "当日主题", "highlights": ["亮点"],
  "schedule": [{
    "time_slot": "morning|noon|afternoon|evening|night",
    "start_time": "HH:MM", "end_time": "HH:MM",
    "activity_type": "sightseeing|dining|transport|accommodation|shopping|entertainment|rest",
    "title": "", "description": "",
    "location": { "name": "", "address": "", "latitude": 0, "longitude": 0 },
    "estimated_cost": { "amount": 0, "currency": "CNY", "per_person": true },
    "booking_info": { "provider": "", "deep_link": "", "booking_type": "none" },
    "tips": "", "image_url": ""
  }]
}`

const GLOBAL_SCHEMA = `{
  "summary": { "title": "方案标题", "destination_label": "", "duration_label": "X天X晚", "theme_tags": [], "cover_image_url": "" },
  "transportation": { "intercity": [{ "leg": "出发地→目的地", "mode": "flight|train|bus|self_drive",
      "recommendations": [{ "option": "航班号/车次", "departure_time": "HH:MM", "arrival_time": "HH:MM", "duration": "", "price_range": "", "booking_link": "" }] }],
    "local": { "recommendation": "市内交通建议", "tips": "" } },
  "accommodation": [{ "name": "", "address": "", "price_range": "", "rating": 0, "reason": "推荐理由", "booking_link": "", "image_url": "" }],
  "budget_breakdown": { "transport": 0, "accommodation": 0, "food": 0, "tickets": 0, "shopping": 0, "other": 0, "total_estimated": 0, "currency": "CNY" },
  "practical_info": { "weather_tips": "", "packing_list": [], "emergency_contacts": [{ "name": "", "number": "" }], "visa_info": "", "insurance_tips": "" }
}`

/**
 * 旅行规划 Agent：基于 LangChain createAgent 封装模型与全部提示词。
 * 无工具、单次问答，图在并发 invoke 间无共享状态，可安全并行调用。
 */
@Injectable()
export class TravelPlanAgent {
  private agent: ReturnType<typeof createAgent> | null = null

  get isConfigured(): boolean {
    return !!process.env.LLM_API_KEY
  }

  private getAgent() {
    if (!this.agent) {
      const model = new ChatOpenAI({
        model: process.env.LLM_MODEL || 'kimi-k2.6',
        apiKey: process.env.LLM_API_KEY,
        configuration: {
          baseURL: (process.env.LLM_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/$/, '')
        },
        timeout: 280_000,
        maxRetries: 1
      })
      this.agent = createAgent({
        model,
        name: 'travel-planner',
        systemPrompt: CORE_PRINCIPLES
      })
    }
    return this.agent
  }

  /** 全局信息提示词（不含每日行程） */
  buildGlobalPrompt(digest: string): string {
    return `用户需求：${digest}\n\n请只生成旅行方案的"全局信息"部分（不含每日行程），JSON 结构：\n${GLOBAL_SCHEMA}`
  }

  /** 单日行程提示词 */
  buildDayPrompt(digest: string, dayIndex: number, totalDays: number, date: string): string {
    const first = dayIndex === 0 ? '当天为抵达日，行程从午后开始；' : ''
    const last = dayIndex === totalDays - 1 ? '当天为返程日，下午不排重活动；' : ''
    return `用户需求：${digest}\n\n请只生成第 ${dayIndex + 1} 天（${date}）的行程安排，4-6 个活动节点，餐饮覆盖三餐，${first}${last}JSON 结构：\n${SCHEDULE_SCHEMA}`
  }

  /** 调一次 Agent，返回解析后的 JSON */
  async askJson(userPrompt: string): Promise<any> {
    const result: any = await this.getAgent().invoke({
      messages: [{ role: 'user', content: userPrompt }]
    })
    const last = result.messages?.[result.messages.length - 1]
    return this.extractJson(this.toText(last?.content))
  }

  /** 消息 content 可能是字符串或 content block 数组，统一转成文本 */
  private toText(content: any): string {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .filter((b) => b?.type === 'text' || typeof b === 'string')
        .map((b) => (typeof b === 'string' ? b : b.text))
        .join('')
    }
    return ''
  }

  /** 从模型返回文本中提取 JSON 对象 */
  private extractJson(text: string): any {
    if (!text) return null
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}
