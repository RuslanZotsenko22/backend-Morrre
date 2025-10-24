import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import * as bodyParser from 'body-parser'
import * as express from 'express'
import { join } from 'path'
import { startUserStatsWorker } from './users/stats/user-stats.worker';
import { MongoDuplicateKeyFilter } from './common/filters/mongo-duplicate.filter';

// якщо робив ensure-файл — розкоментуй 2 рядки нижче
// import { ensureHireUploadDir } from './common/fs/ensureUploadDir'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // 0) (опційно) створити папку для аплоадів, якщо її немає
  // ensureHireUploadDir()

  // 1) CORS (дозволь CMS-адмінку і свій фронт, якщо є)
  app.enableCors({
    origin: ['http://localhost:3001'], // + додай свій фронт, якщо інший порт/домен
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,X-Internal-Secret,X-Queue-Secret',
  })

  // 2) Статика для завантажень hire (без префікса /api — так простіше)
  app.use('/uploads/hire', express.static(join(process.cwd(), 'uploads', 'hire')))

  // статика для кейсів (drafts / final)
  app.use('/uploads/cases', express.static(join(process.cwd(), 'uploads', 'cases')))

  // ⬇⬇⬇ ДОДАНО: статика для public і public/uploads
  app.use('/public', express.static(join(process.cwd(), 'public')))
  app.use('/uploads', express.static(join(process.cwd(), 'public', 'uploads')))

  // 3) Глобальний префікс API
  app.setGlobalPrefix('api')

  // 4) RAW body тільки для Vimeo webhook — має бути ДО json/urlencoded
  app.use('/api/vimeo/webhook', bodyParser.raw({ type: '*/*' }))

  // 5) Інші парсери
  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded({ extended: true }))

  // 6) Валідація DTO
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }))

  // 6.1) Глобальний фільтр Mongo duplicate key (E11000) → 400 замість 500
  app.useGlobalFilters(new MongoDuplicateKeyFilter());

  // 7) Swagger
  const config = new DocumentBuilder()
    .setTitle('Branding API')
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  const doc = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('docs', app, doc)

  // 8) Запуск
  const port = Number(process.env.PORT) || 4000
  await app.listen(port)
  console.log(`Nest listening on http://localhost:${port}`)

  startUserStatsWorker();
}

bootstrap()
