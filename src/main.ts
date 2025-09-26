import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  //  ВАЖЛИВО: raw body тільки для вебхука Vimeo (щоб коректно рахувати HMAC)
  // Ставимо ПЕРЕД listen і ПЕРЕД іншими парсерами
  app.use('/api/vimeo/webhook', bodyParser.raw({ type: '*/*' })); // або 'application/json'

  // (опційно) загальні парсери для решти роутів
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  const config = new DocumentBuilder()
    .setTitle('Branding API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, doc);

  await app.listen(process.env.PORT || 4000);
}

bootstrap();
