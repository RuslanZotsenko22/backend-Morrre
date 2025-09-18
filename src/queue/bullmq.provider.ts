import { Provider } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const QUEUE_TOKENS = {
  VIDEO_QUEUE: 'VIDEO_QUEUE',
  REDIS: 'REDIS',
};

export const BullMqProviders: Provider[] = [
  {
    provide: QUEUE_TOKENS.REDIS,
    useFactory: () => {
      // Створюємо інстанс IORedis (BullMQ очікує саме його)
      return new IORedis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number(process.env.REDIS_PORT || 6379),
        // опційно:
         maxRetriesPerRequest: null,
         enableReadyCheck: true,
      });
    },
  },
  {
    provide: QUEUE_TOKENS.VIDEO_QUEUE,
    useFactory: (redis: IORedis) =>
      new Queue('video-uploads', {
        connection: redis,
        // опційно: defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 2000 } },
      }),
    inject: [QUEUE_TOKENS.REDIS],
  },
];
