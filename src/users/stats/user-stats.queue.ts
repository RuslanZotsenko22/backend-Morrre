import { Provider } from '@nestjs/common';
import { Queue } from 'bullmq';

export const USER_STATS_QUEUE = 'user-stats';

export const UserStatsQueueProvider: Provider = {
  provide: USER_STATS_QUEUE,
  useFactory: () => new Queue(USER_STATS_QUEUE, { connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' } } as any),
};
