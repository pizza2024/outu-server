import { Module } from '@nestjs/common'
import { PlanModule } from './plan/plan.module'
import { AuthModule } from './auth/auth.module'
import { GeoController } from './geo/geo.controller'

@Module({
  imports: [PlanModule, AuthModule],
  controllers: [GeoController]
})
export class AppModule {}
