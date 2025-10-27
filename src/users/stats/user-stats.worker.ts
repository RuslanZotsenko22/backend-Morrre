import { Worker, QueueEvents } from 'bullmq';
import mongoose, { Model, Types } from 'mongoose';

/**
 * Підрахунок агрегованої статистики користувача.
 *  - totalScore (повний рейтинг за ТЗ)
 *  - weeklyScore (за останні 7 днів; якість та кількість нових кейсів)
 */
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

    // ===== (1) Твоя існуюча агрегaція — НЕ чіпаю =====
    const [agg] = await Case.aggregate([
      {
        $match: {
          
          isPublished: true,
          $or: [{ authorId: uid }, { contributors: uid }],
        },
      },
      {
        $group: {
          _id: null,
          votes:  { $sum: '$votesCount' },
          views:  { $sum: '$views' },
          shots:  { $sum: '$shotsCount' },
          rating: { $sum: '$score' }, // залишаємо як у твоїй логіці
        },
      },
    ]);

    // ===== (2) totalScore за ТЗ (повний) =====
    
    const [aggTotal] = await Case.aggregate([
      {
        $match: {
          status: 'published',
          $or: [{ ownerId: uid }, { 'contributors.userId': uid }],
        },
      },
      {
        $project: {
          rating:    { $ifNull: ['$juryAvgOverall', { $ifNull: ['$avgRating', 0] }] },
          refsLikes: { $ifNull: ['$refsLikes', 0] },
        },
      },
      {
        $group: {
          _id: null,
          qualitySum: {
            $sum: {
              $cond: [
                { $gte: ['$rating', 7] },
                { $multiply: [ { $pow: [ { $subtract: ['$rating', 7] }, 2 ] }, 30 ] },
                0,
              ],
            },
          },
          refsLikesTotal: { $sum: '$refsLikes' },
          caseCount: { $sum: 1 },
        },
      },
    ]);

    const followers = await Follow.countDocuments({ targetId: uid });

    const qualityScore = Number(aggTotal?.qualitySum || 0);
    const referenceScore = Math.log(1 + Number(aggTotal?.refsLikesTotal || 0)) * 15;
    const caseCountScore = Number(aggTotal?.caseCount || 0) * 10;
    const totalScore = Math.round(qualityScore + referenceScore + caseCountScore);

    // ===== (3) weeklyScore за останні 7 днів =====
    
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [aggWeekly] = await Case.aggregate([
      {
        $match: {
          status: 'published',
          $or: [{ ownerId: uid }, { 'contributors.userId': uid }],
          createdAt: { $gte: since }, // можна змінити на publishedAt, якщо додаси це поле
        },
      },
      {
        $project: {
          rating: { $ifNull: ['$juryAvgOverall', { $ifNull: ['$avgRating', 0] }] },
        },
      },
      {
        $group: {
          _id: null,
          qualitySum: {
            $sum: {
              $cond: [
                { $gte: ['$rating', 7] },
                { $multiply: [ { $pow: [ { $subtract: ['$rating', 7] }, 2 ] }, 30 ] },
                0,
              ],
            },
          },
          caseCount: { $sum: 1 },
        },
      },
    ]);

    const weeklyQualityScore = Number(aggWeekly?.qualitySum || 0);
    const weeklyCaseCountScore = Number(aggWeekly?.caseCount || 0) * 10;
    // refsLikes за 7 днів тут не підраховуємо (нема подій із датами) → 0
    const weeklyScore = Math.round(weeklyQualityScore + weeklyCaseCountScore);

    // ===== (4) Запис у user_stats =====
    await UserStats.updateOne(
      { userId: uid },
      {
        $set: {
          
          votes:     agg?.votes  || 0,
          views:     agg?.views  || 0,
          shots:     agg?.shots  || 0,
          rating:    agg?.rating || 0,
          followers,

          
          totalScore,
          weeklyScore,

          lastRecountAt: new Date(),
        },
      },
      { upsert: true },
    );

    return { userId, totalScore, weeklyScore };
  }, redis);

  worker.on('completed', (job) => console.log('[user-stats] completed', job.id));
  worker.on('failed', (job, err) => console.error('[user-stats] failed', job?.id, err));
  return worker;
}
