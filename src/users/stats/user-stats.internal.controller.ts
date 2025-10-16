import { Controller, Param, Post } from '@nestjs/common';
import { Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserStats } from '../schemas/user-stats.schema';
import { Queue } from 'bullmq';
import { Inject } from '@nestjs/common';
import { USER_STATS_QUEUE } from './user-stats.queue';

@Controller('api/internal/user-stats')
export class UserStatsInternalController {
  constructor(
    @Inject(USER_STATS_QUEUE) private readonly queue: Queue,
    @InjectModel(UserStats.name) private readonly statsModel: Model<UserStats>,
  ) {}

  @Post(':userId/recount')
  async recount(@Param('userId') userId: string) {
    // додаємо задачу в чергу і повертаємо поточні/старі значення — щоб одразу бачити відповідь
    await this.queue.add('recount', { userId });
    const doc = await this.statsModel.findOne({ userId: new Types.ObjectId(userId) }).lean();
    return { enqueued: true, current: doc ?? null };
  }
}
