import { Worker, QueueEvents } from 'bullmq';
import mongoose, { Model, Types } from 'mongoose';

export function startUserStatsWorker() {
  const redis = { connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' } } as any;

  new QueueEvents('user-stats', redis);

  const worker = new Worker('user-stats', async (job) => {
    const { userId } = job.data as { userId: string };
    const uid = new Types.ObjectId(userId);

    const conn = mongoose.connection;
    if (conn.readyState !== 1) throw new Error('Mongo connection is not ready in inline worker');

    const Case: Model<any> = conn.model('Case');
    const Follow: Model<any> = conn.model('Follow');
    const UserStats: Model<any> = conn.model('UserStats');

    const [agg] = await Case.aggregate([
      { $match: { isPublished: true, $or: [{ authorId: uid }, { contributors: uid }] } },
      {
        $group: {
          _id: null,
          votes:   { $sum: '$votesCount' },
          views:   { $sum: '$views' },
          shots:   { $sum: '$shotsCount' },
          rating:  { $sum: '$score' },        // ✅ Σ score
        },
      },
    ]);

    const followers = await Follow.countDocuments({ targetId: uid });

    await UserStats.updateOne(
      { userId: uid },
      {
        $set: {
          votes:  agg?.votes  || 0,
          views:  agg?.views  || 0,
          shots:  agg?.shots  || 0,
          rating: agg?.rating || 0,           // ✅ зберігаємо рейтинг
          followers,
          lastRecountAt: new Date(),
        },
      },
      { upsert: true },
    );

    return { userId };
  }, redis);

  worker.on('completed', (job) => console.log('[user-stats] completed', job.id));
  worker.on('failed', (job, err) => console.error('[user-stats] failed', job?.id, err));
  return worker;
}
