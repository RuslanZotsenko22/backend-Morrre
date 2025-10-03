import { Provider } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const QUEUE_TOKENS = {
  VIDEO_QUEUE: 'VIDEO_QUEUE',
  POPULAR_QUEUE: 'POPULAR_QUEUE',
  REDIS: 'REDIS',
};

export const BullMqProviders: Provider[] = [
  {
    provide: QUEUE_TOKENS.REDIS,
    useFactory: () => {
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
        // defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 2000 } },
      }),
    inject: [QUEUE_TOKENS.REDIS],
  },
  {
    provide: QUEUE_TOKENS.POPULAR_QUEUE,
    useFactory: (redis: IORedis) =>
      new Queue('popular-jobs', {
        connection: redis,
        // defaultJobOptions: { attempts: 3, backoff: { type: 'fixed', delay: 1000 } },
      }),
    inject: [QUEUE_TOKENS.REDIS],
  },
];
