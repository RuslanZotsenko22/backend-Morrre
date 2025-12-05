// src/botnet/curator-analytics.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { CuratorAnalyticsController } from './curator-analytics.controller';
import { CuratorAnalyticsService } from './services/curator-analytics.service';
import { CaseSchema } from '../cases/schemas/case.schema';
import { BotSchema } from './schemas/bot.schema';
import { BotnetModule } from './botnet.module';

@Module({
  imports: [
    HttpModule,
    MongooseModule.forFeature([
      { name: 'Case', schema: CaseSchema },
      { name: 'Bot', schema: BotSchema }, // 👈 Додаємо схему Bot
    ]),
    forwardRef(() => BotnetModule),
  ],
  controllers: [CuratorAnalyticsController],
  providers: [CuratorAnalyticsService],
  exports: [CuratorAnalyticsService],
})
export class CuratorAnalyticsModule {}