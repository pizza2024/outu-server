import { Module } from '@nestjs/common'
import { PlanModule } from './plan/plan.module'
import { AuthModule } from './auth/auth.module'

@Module({
  imports: [PlanModule, AuthModule]
})
export class AppModule {}
