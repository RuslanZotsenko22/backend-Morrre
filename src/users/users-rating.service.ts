import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserStats, UserStatsDocument } from './schemas/user-stats.schema';

// Очікуємо існуючі моделі
import { CaseDocument } from '../cases/schemas/case.schema';

@Injectable()
export class UsersRatingService {
  private readonly log = new Logger(UsersRatingService.name);

  constructor(
    @InjectModel('Case') private readonly caseModel: Model<CaseDocument>,
    @InjectModel('User') private readonly userModel: Model<any>,
    @InjectModel('CaseVote') private readonly caseVoteModel: Model<any>,
    @InjectModel(UserStats.name) private readonly statsModel: Model<UserStatsDocument>,
  ) {}

  /** перерахунок усього рейтингу (all-time + weekly) */
  async recomputeAll(): Promise<{ users: number }> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // ---- ALL-TIME
    const allTime = await this.aggregateScores({ period: 'all' });

    // ---- WEEKLY
    const weekly = await this.aggregateScores({ period: 'weekly', since });

    // Мерджимо all + weekly → upsert у user_stats
    const weeklyMap = new Map<string, number>();
    for (const w of weekly) weeklyMap.set(String(w._id), w.totalScore);

    let upserts = 0;
    for (const a of allTime) {
      const userId = new Types.ObjectId(String(a._id));
      const weeklyScore = weeklyMap.get(String(a._id)) ?? 0;

      const payload = {
        userId,
        totalScore: a.totalScore,
        weeklyScore,
        caseCount: a.caseCount,
        refsLikesTotal: a.refsLikesTotal,
        casesOver7Count: a.casesOver7Count,
      };

      await this.statsModel.updateOne(
        { userId },
        { $set: payload },
        { upsert: true },
      );

      upserts++;
    }

    // Якщо у weekly є користувачі без allTime (наприклад, нові) — теж збережемо
    for (const w of weekly) {
      const key = String(w._id);
      if (allTime.find((a) => String(a._id) === key)) continue;

      const userId = new Types.ObjectId(key);
      await this.statsModel.updateOne(
        { userId },
        {
          $set: {
            userId,
            totalScore: 0,
            weeklyScore: w.totalScore,
            caseCount: w.caseCount,
            refsLikesTotal: w.refsLikesTotal,
            casesOver7Count: w.casesOver7Count,
          },
        },
        { upsert: true },
      );
      upserts++;
    }

    this.log.log(`UserStats upserted: ${upserts}`);
    return { users: upserts };
  }

  /** Лідерборд */
  async leaderboard(params: { period: 'all' | 'weekly'; limit?: number; offset?: number }) {
    const limit = Math.min(Math.max(Number(params.limit ?? 20), 1), 100);
    const offset = Math.max(Number(params.offset ?? 0), 0);

    const sort: any = params.period === 'weekly' ? { weeklyScore: -1 } : { totalScore: -1 };

    const items = await this.statsModel
      .find({}, { userId: 1, totalScore: 1, weeklyScore: 1, caseCount: 1, refsLikesTotal: 1, casesOver7Count: 1 })
      .sort(sort)
      .skip(offset)
      .limit(limit)
      .lean();

    // підтягнемо базові поля користувача
    const ids = items.map((i) => i.userId);
    const users = await this.userModel
      .find({ _id: { $in: ids } }, { _id: 1, name: 1, email: 1, avatar: 1 })
      .lean();

    const uMap = new Map<string, any>(users.map(u => [String(u._id), u]));

    // додаємо позицію (rank) і профіль
    const enriched = items.map((it, i) => {
      const user = uMap.get(String(it.userId));
      return {
        rank: offset + i + 1,
        userId: String(it.userId),
        user: user ? { id: String(user._id), name: user.name, email: user.email, avatar: user.avatar } : null,
        totalScore: it.totalScore,
        weeklyScore: it.weeklyScore,
        caseCount: it.caseCount,
        refsLikesTotal: it.refsLikesTotal,
        casesOver7Count: it.casesOver7Count,
      };
    });

    return { items: enriched, limit, offset, period: params.period };
  }

  // ----------------------------
  // ВНУТРІШНІ АГРЕГАЦІЇ
  // ----------------------------

  private async aggregateScores(params: { period: 'all' | 'weekly'; since?: Date }) {
    const since = params.period === 'weekly' ? params.since ?? new Date(Date.now() - 7 * 864e5) : undefined;

    // A) Бал за якість кейсів (тільки якщо juryAvgOverall >= 7.0)
    // points = ((rating - 7)^2) * 30; sum по кейсам користувача
    const caseMatch: any = { status: 'published' };
    if (since) {
      caseMatch.createdAt = { $gte: since };
    }

    const qualityAgg = await this.caseModel.aggregate([
      { $match: caseMatch },
      {
        $project: {
          ownerId: 1,
          rating: '$juryAvgOverall',
          over7: { $gte: ['$juryAvgOverall', 7] },
        },
      },
      {
        $project: {
          ownerId: 1,
          score: {
            $cond: [
              '$over7',
              { $multiply: [{ $pow: [{ $subtract: ['$rating', 7] }, 2] }, 30] },
              0,
            ],
          },
          over7: { $cond: ['$over7', 1, 0] },
        },
      },
      {
        $group: {
          _id: '$ownerId',
          qualityScore: { $sum: '$score' },
          casesOver7Count: { $sum: '$over7' },
          caseCount: { $sum: 1 },
        },
      },
    ]);

    // B) Лайки на референсах (лог згладжування) × 15
    // Беремо з CaseVote (на випадок різних назв типів — підстрахуємось)
    const likeMatch: any = {};
    if (since) likeMatch.createdAt = { $gte: since };
    likeMatch.type = { $in: ['refLike', 'referenceLike', 'ref_like', 'ref'] };

    // join CaseVote -> Case (щоб знати ownerId)
    const refsAgg = await this.caseVoteModel.aggregate([
      { $match: likeMatch },
      {
        $lookup: {
          from: 'cases',
          localField: 'caseId',
          foreignField: '_id',
          as: 'case',
        },
      },
      { $unwind: '$case' },
      { $match: { 'case.status': 'published' } },
      {
        $group: {
          _id: '$case.ownerId',
          refsLikesTotal: { $sum: 1 },
        },
      },
      {
        $project: {
          refsLikesTotal: 1,
          refsLikesScore: {
            $multiply: [{ $ln: { $add: [1, '$refsLikesTotal'] } }, 15],
          },
        },
      },
    ]);

    // Мерджимо A + B
    const qMap = new Map<string, any>(qualityAgg.map(q => [String(q._id), q]));
    const rMap = new Map<string, any>(refsAgg.map(r => [String(r._id), r]));

    const allUserIds = new Set<string>([
      ...Array.from(qMap.keys()),
      ...Array.from(rMap.keys()),
    ]);

    const out: Array<{
      _id: Types.ObjectId;
      totalScore: number;
      caseCount: number;
      refsLikesTotal: number;
      casesOver7Count: number;
    }> = [];

    for (const id of allUserIds) {
      const q = qMap.get(id);
      const r = rMap.get(id);

      const caseCount = q?.caseCount ?? 0;
      const qualityScore = q?.qualityScore ?? 0;
      const casesOver7Count = q?.casesOver7Count ?? 0;

      const refsLikesTotal = r?.refsLikesTotal ?? 0;
      const refsLikesScore = r?.refsLikesScore ?? 0;

      const activityBonus = caseCount * 10;

      const totalScore = (qualityScore || 0) + (refsLikesScore || 0) + activityBonus;

      out.push({
        _id: new Types.ObjectId(id),
        totalScore,
        caseCount,
        refsLikesTotal,
        casesOver7Count,
      });
    }

    return out;
  }
}
