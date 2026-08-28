import { Module } from '@nestjs/common'
import { PlanController } from './plan.controller'
import { PlanService } from './plan.service'
import { TravelPlanAgent } from './travel-plan.agent'

@Module({
  controllers: [PlanController],
  providers: [PlanService, TravelPlanAgent]
})
export class PlanModule {}
