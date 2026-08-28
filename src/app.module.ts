import { Module } from '@nestjs/common'
import { PlanModule } from './plan/plan.module'

@Module({
  imports: [PlanModule]
})
export class AppModule {}
