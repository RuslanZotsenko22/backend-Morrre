import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import * as bodyParser from 'body-parser'
import * as express from 'express'
import { join } from 'path'
import { startUserStatsWorker } from './users/stats/user-stats.worker'
import { MongoDuplicateKeyFilter } from './common/filters/mongo-duplicate.filter'
 //import * as cookieParser from 'cookie-parser' 

 //import { ensureHireUploadDir } from './common/fs/ensureUploadDir'
import { ConfigService } from '@nestjs/config'

function parseOrigins(input?: string): string[] {
  if (!input) return []
  return input
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const config = app.get(ConfigService)

  // Створити папку для аплоадів, якщо є util
  // ensureHireUploadDir()

  
  const envOrigins = parseOrigins(config.get<string>('CORS_ORIGIN'))
  const fallbackOrigins = ['http://localhost:3001', 'http://localhost:3000']
  const origins = envOrigins.length ? envOrigins : fallbackOrigins

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,X-Internal-Secret,X-Queue-Secret',
  })

  // ===== Статика для локальних завантажень =====
  
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')))

  
  app.use('/public', express.static(join(process.cwd(), 'public')))

  
   app.use('/uploads/hire', express.static(join(process.cwd(), 'uploads', 'hire')))
   app.use('/uploads/cases', express.static(join(process.cwd(), 'uploads', 'cases')))

  
  app.setGlobalPrefix('api')

  
  app.use('/api/vimeo/webhook', bodyParser.raw({ type: '*/*' }))

  
  app.use(bodyParser.json({ limit: '20mb' }))
  app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }))
   //app.use(cookieParser()) 

  
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }))

  
  app.useGlobalFilters(new MongoDuplicateKeyFilter())

  
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Branding API')
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  const doc = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('docs', app, doc)

  
  const port = Number(process.env.PORT) || 4000
  await app.listen(port)
  console.log(`Nest listening on http://localhost:${port}`)
  console.log(`CORS origins: ${origins.join(', ') || '(none)'}`)

  
  startUserStatsWorker()
}

bootstrap()
