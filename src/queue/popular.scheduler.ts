import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_TOKENS } from './bullmq.provider';

/**
 * Реєструє repeatable jobs:
 * - daily-publish: щодня о 09:00
 * - hourly-decay: щогодини на "00"
 */
@Injectable()
export class PopularScheduler implements OnModuleInit {
  constructor(@Inject(QUEUE_TOKENS.POPULAR_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    await this.queue.add(
      'daily-publish',
      {},
      {
        repeat: { pattern: '0 9 * * *' }, // 09:00 щодня
        removeOnComplete: true,
        jobId: 'popular:daily-publish',
      },
    );

    await this.queue.add(
      'hourly-decay',
      {},
      {
        repeat: { pattern: '0 * * * *' }, // кожну годину на 00 хв
        removeOnComplete: true,
        jobId: 'popular:hourly-decay',
      },
    );
  }
}
