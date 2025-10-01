import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS для CMS (http://localhost:3001)
  app.enableCors({
    origin: ['http://localhost:3001'],
    credentials: true,
     methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  allowedHeaders: 'Content-Type,Authorization,X-Internal-Secret,X-Queue-Secret',
  });

  // Глобальний префікс API
  app.setGlobalPrefix('api');

  // RAW body лише для Vimeo webhook — має бути ДО інших парсерів
  app.use('/api/vimeo/webhook', bodyParser.raw({ type: '*/*' }));

  // Решта парсерів (якщо потрібно)
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  // Валідація
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Branding API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, doc);

  // ЄДИНИЙ виклик listen()
  const port = Number(process.env.PORT) || 4000;
  await app.listen(port);
  console.log(`Nest listening on http://localhost:${port}`);
}

bootstrap();
