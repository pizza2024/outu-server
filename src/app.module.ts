import { Module } from '@nestjs/common'
import { PlanModule } from './plan/plan.module'
import { AuthModule } from './auth/auth.module'
import { PosterController } from './poster/poster.controller'

@Module({
  imports: [PlanModule, AuthModule],
  controllers: [PosterController]
})
export class AppModule {}
