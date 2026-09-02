import { Injectable, Logger } from '@nestjs/common'
import { TravelPlanAgent } from './travel-plan.agent'

interface PlanJob {
  status: 'pending' | 'done' | 'error'
  plan?: any
  error?: string
  created_at: number
}

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name)
  /** 生成任务表（内存版，MVP 够用；容器重启任务丢失，前端会超时提示重试） */
  private jobs = new Map<string, PlanJob>()

  constructor(private readonly travelPlanAgent: TravelPlanAgent) {}

  /** 创建异步生成任务：立即返回 job_id，后台执行 */
  createJob(request: any): string {
    const jobId = request.request_id || `job_${Date.now()}`
    this.jobs.set(jobId, { status: 'pending', created_at: Date.now() })
    this.pruneJobs()
    this.generatePlan(request)
      .then((r) => {
        if (r.plan) {
          this.jobs.set(jobId, { status: 'done', plan: r.plan, created_at: Date.now() })
        } else {
          this.jobs.set(jobId, { status: 'error', error: r.error || '生成失败', created_at: Date.now() })
        }
      })
      .catch((e) => {
        this.logger.error(`任务 ${jobId} 异常: ${e?.message}`)
        this.jobs.set(jobId, { status: 'error', error: String(e?.message || e), created_at: Date.now() })
      })
    return jobId
  }

  /** 查询任务结果 */
  getJob(jobId: string): PlanJob | null {
    return this.jobs.get(jobId) || null
  }

  /** 清理 2 小时前的任务 */
  private pruneJobs() {
    const cutoff = Date.now() - 2 * 3600 * 1000
    for (const [id, job] of this.jobs) {
      if (job.created_at < cutoff) this.jobs.delete(id)
    }
  }

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
