import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common'
import { PlanService } from './plan.service'

@Controller('api/plan')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  /**
   * 提交生成任务（异步）：立即返回 { job_id }
   * AI 生成耗时 1~4 分钟，同步等待会被 callContainer 网关超时掐断，
   * 前端拿到 job_id 后轮询 /api/plan/result
   */
  @Post('generate')
  generate(
    @Body() body: { request: any },
    @Headers('x-outu-token') token?: string
  ) {
    const expected = process.env.API_TOKEN
    if (expected && token !== expected) {
      throw new UnauthorizedException({ plan: null, error: '接口鉴权失败' })
    }
    if (!body?.request?.destinations?.length) {
      return { job_id: null, error: '缺少需求数据' }
    }
    const jobId = this.planService.createJob(body.request)
    return { job_id: jobId }
  }

  /** 轮询任务结果：{ status: pending | done | error, plan?, error? } */
  @Post('result')
  result(
    @Body() body: { job_id?: string },
    @Headers('x-outu-token') token?: string
  ) {
    const expected = process.env.API_TOKEN
    if (expected && token !== expected) {
      throw new UnauthorizedException({ error: '接口鉴权失败' })
    }
    if (!body?.job_id) return { status: 'error', error: '缺少 job_id' }
    const job = this.planService.getJob(body.job_id)
    if (!job) return { status: 'error', error: '任务不存在或已过期，请重新生成' }
    if (job.status === 'done') return { status: 'done', plan: job.plan }
    if (job.status === 'error') return { status: 'error', error: job.error }
    return { status: 'pending' }
  }
}
