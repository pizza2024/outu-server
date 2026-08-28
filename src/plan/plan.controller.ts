import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common'
import { PlanService } from './plan.service'

@Controller('api/plan')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  /**
   * 生成旅行方案
   * 入参：{ request: TravelRequest }（PRD 3.1）
   * 出参：{ plan: TravelPlan }（PRD 3.2）；失败返回 { plan: null, error }
   */
  @Post('generate')
  async generate(
    @Body() body: { request: any },
    @Headers('x-outu-token') token?: string
  ) {
    // 配置了 API_TOKEN 时强制校验，防止接口被薅
    const expected = process.env.API_TOKEN
    if (expected && token !== expected) {
      throw new UnauthorizedException({ plan: null, error: '接口鉴权失败' })
    }
    if (!body?.request?.destinations?.length) {
      return { plan: null, error: '缺少需求数据' }
    }
    return this.planService.generatePlan(body.request)
  }
}
