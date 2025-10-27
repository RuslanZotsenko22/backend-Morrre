import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import * as bodyParser from 'body-parser'
import * as express from 'express'
import { join } from 'path'
import { startUserStatsWorker } from './users/stats/user-stats.worker'
import { MongoDuplicateKeyFilter } from './common/filters/mongo-duplicate.filter'
// import * as cookieParser from 'cookie-parser' // розкоментуй, якщо використовуєш refresh-куки

// import { ensureHireUploadDir } from './common/fs/ensureUploadDir'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Створити папку для аплоадів, якщо є util
  // ensureHireUploadDir()

  // CORS (додай фронт, якщо інший домен/порт)
  app.enableCors({
    origin: ['http://localhost:3001', 'http://localhost:3000'],
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,X-Internal-Secret,X-Queue-Secret',
  })

  // ===== Статика для локальних завантажень =====
  // ГОЛОВНЕ: віддаємо з кореня /uploads -> ./uploads (щоб працювали avatars, cases, тощо)
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')))

  // Якщо десь ще використовуються старі шляхи з /public — залишаємо сумісність:
  app.use('/public', express.static(join(process.cwd(), 'public')))

  // (Не обов’язково, бо рядком вище ми вже віддаємо весь /uploads)
  // app.use('/uploads/hire', express.static(join(process.cwd(), 'uploads', 'hire')))
  // app.use('/uploads/cases', express.static(join(process.cwd(), 'uploads', 'cases')))

  // Глобальний префікс API (важливо виставити до налаштування webhook raw body-шляху)
  app.setGlobalPrefix('api')

  // RAW body лише для Vimeo webhook — ПЕРЕД json/urlencoded
  app.use('/api/vimeo/webhook', bodyParser.raw({ type: '*/*' }))

  // Інші парсери
  app.use(bodyParser.json({ limit: '20mb' }))
  app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }))
  // app.use(cookieParser()) // якщо працюєш із куками (refresh tokens тощо)

  // Валідація DTO
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }))

  // Глобальний фільтр дубліката Mongo (E11000)
  app.useGlobalFilters(new MongoDuplicateKeyFilter())

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Branding API')
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  const doc = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('docs', app, doc)

  // Запуск
  const port = Number(process.env.PORT) || 4000
  await app.listen(port)
  console.log(`Nest listening on http://localhost:${port}`)

  // Фоновий воркер
  startUserStatsWorker()
}

bootstrap()
