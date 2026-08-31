import { Injectable } from '@nestjs/common'
import { TravelPlanAgent } from './travel-plan.agent'

@Injectable()
export class PlanService {
  constructor(private readonly travelPlanAgent: TravelPlanAgent) {}

  private reqDigest(request: any): string {
    return JSON.stringify({
      出发地: request.origin,
      目的地: request.destinations,
      日期: request.travel_dates,
      人员: request.travelers,
      预算: request.budget,
      偏好: request.preferences,
      特殊要求: request.special_requests
    })
  }

  /**
   * 按天并行生成：1 个请求出全局信息 + N 个请求各出一天行程。
   * 总耗时 ≈ 最慢的单个请求，不受 60s 限制也可显著提速。
   */
  async generatePlan(request: any): Promise<{ plan: any; error?: string }> {
    if (!this.travelPlanAgent.isConfigured) {
      return { plan: null, error: 'LLM_API_KEY 未配置（在 outu-server/.env 中设置）' }
    }

    const totalDays = Math.min(Math.max(request.travel_dates?.total_days || 2, 1), 7)
    const digest = this.reqDigest(request)
    const start = new Date(request.travel_dates?.departure_date || Date.now())
    const dayDates = Array.from({ length: totalDays }, (_, i) =>
      new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10)
    )

    try {
      const agent = this.travelPlanAgent
      const globalTask = agent.askJson(agent.buildGlobalPrompt(digest))
      const dayTasks = dayDates.map((date, i) =>
        agent.askJson(agent.buildDayPrompt(digest, i, totalDays, date))
      )

      const [global, ...days] = await Promise.all([globalTask, ...dayTasks])

      if (!global?.summary) {
        return { plan: null, error: '全局信息生成失败，请重试' }
      }

      const daily_plans = days.map((d, i) => {
        const day = d?.schedule ? d : { schedule: [] }
        day.day = i + 1
        day.date = dayDates[i]
        day.theme = day.theme || '自由探索'
        day.highlights = day.highlights || []
        return day
      })

      const plan = {
        plan_id: request.request_id,
        request_id: request.request_id,
        generated_at: new Date().toISOString(),
        summary: global.summary,
        daily_plans,
        transportation: global.transportation || { intercity: [], local: { recommendation: '', tips: '' } },
        accommodation: global.accommodation || [],
        budget_breakdown: global.budget_breakdown || {
          transport: 0, accommodation: 0, food: 0, tickets: 0, shopping: 0, other: 0, total_estimated: 0, currency: 'CNY'
        },
        practical_info: global.practical_info || {
          weather_tips: '', packing_list: [], emergency_contacts: [], visa_info: '', insurance_tips: ''
        }
      }
      return { plan }
    } catch (e: any) {
      return { plan: null, error: String(e?.message || e) }
    }
  }
}
