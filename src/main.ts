import 'reflect-metadata'
import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.enableCors() // 本地 H5 调试方便；小程序端不受 CORS 限制
  const port = process.env.PORT || 3000
  await app.listen(port)
  console.log(`[鸥途] 后端已启动：http://127.0.0.1:${port}`)
}
bootstrap()
