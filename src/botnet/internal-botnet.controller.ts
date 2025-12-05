import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { InternalSecretGuard } from '../common/guards/internal-secret.guard';
import { BotQueueService } from './services/bot-queue.service';
import { BotManagementService } from './services/bot-management.service';

@Controller('internal/botnet')
@UseGuards(InternalSecretGuard)
export class InternalBotnetController {
  constructor(
    private botQueueService: BotQueueService,
    private botManagementService: BotManagementService,
  ) {}

  @Post('boost-activity')
  async boostActivity(@Body() body: { targetId: string; targetType: string }) {
    // Логіка для запуску бусту активності на кейс/референс
    // Цей ендпоінт буде викликатися з cases.service.ts при публікації кейсу
    return { message: 'Boost activity started' };
  }
}