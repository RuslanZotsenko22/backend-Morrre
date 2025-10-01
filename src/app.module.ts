import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CasesModule } from './cases/cases.module';
import { MediaModule } from './media/media.module';
import { QueueModule } from './queue/queue.module';
import { VimeoModule } from './vimeo/vimeo.module';
import { InternalModule } from './internal/internal.module';

@Module({
  imports: [
    // робимо конфіг глобальним, щоб .env підхоплювався всюди
    ConfigModule.forRoot({ isGlobal: true }),

    // Mongoose через async-варіант, інжектимо ConfigService
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        uri: cfg.get<string>('MONGO_URI')!, // тут важливо, щоб у .env було MONGO_URI
      }),
    }),

    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    AuthModule,
    UsersModule,
    CasesModule,
    MediaModule,
    QueueModule,
    VimeoModule,
    InternalModule,
  ],
})
export class AppModule {}
