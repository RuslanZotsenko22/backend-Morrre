import { Module } from '@nestjs/common';
import { USER_STATS_QUEUE, UserStatsQueueProvider } from './user-stats.queue';

@Module({
  providers: [UserStatsQueueProvider],
  exports: [USER_STATS_QUEUE], // експортуємо токен провайдера Queue
})
export class UserStatsQueueModule {}
