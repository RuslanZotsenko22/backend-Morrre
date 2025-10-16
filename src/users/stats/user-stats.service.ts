import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Queue } from 'bullmq';
import { USER_STATS_QUEUE } from './user-stats.queue';
import { UserStats } from '../schemas/user-stats.schema';

@Injectable()
export class UserStatsService {
  constructor(
    @InjectModel(UserStats.name) private statsModel: Model<UserStats>,
    @Inject(USER_STATS_QUEUE) private queue: Queue,
  ) {}

  enqueueRecount(userId: string) {
    return this.queue.add('recount', { userId }, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
  }

  // опціонально: прямий перерахунок
  async recountNow(userId: string, deps: { caseModel: any; followModel: any }) {
    const uid = new Types.ObjectId(userId);
    const [agg] = await deps.caseModel.aggregate([
      { $match: { isPublished: true, $or: [{ authorId: uid }, { contributors: uid }] } },
      { $group: { _id: null, votes: { $sum: '$votesCount' }, views: { $sum: '$views' }, shots: { $sum: '$shotsCount' } } },
    ]);
    const followers = await deps.followModel.countDocuments({ targetId: uid });

    await this.statsModel.updateOne(
      { userId: uid },
      { $set: { votes: agg?.votes || 0, views: agg?.views || 0, shots: agg?.shots || 0, followers, lastRecountAt: new Date() } },
      { upsert: true },
    );
  }
}
