import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { SearchQueryDto } from './dto/search.query.dto';
import { BotProfileService } from '../botnet/services/bot-profile.service';

// твої сутності
import { User } from '../users/schemas/user.schema';
import { UserProfile } from '../users/schemas/user-profile.schema';
import { Case } from '../cases/schemas/case.schema';

type UserHit = {
  _id: Types.ObjectId;
  username?: string | null;
  email?: string | null;
  role?: string | null;
  name?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  caseCount?: number;
  score: number;
};

type CaseHit = {
  _id: Types.ObjectId;
  title: string;
  coverUrl?: string | null;
  authorId?: Types.ObjectId | null;
  authorName?: string | null;
  categories?: string[];
  score: number;
};

type BotHit = {
  _id: Types.ObjectId;
  username: string;
  email: string;
  avatar: string;
  isBot: boolean;
  botData: {
    canVote: boolean;
    hasAvatar: boolean;
    status: 'active' | 'inactive' | 'suspended';
    activityCount: number;
  };
  score: number;
};

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(UserProfile.name) private readonly profileModel: Model<UserProfile>,
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    private readonly botProfileService: BotProfileService, // Додаємо сервіс ботів
  ) {}

  private buildRegexes(q: string) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ci = new RegExp(safe, 'i');
    const starts = new RegExp('^' + safe, 'i');
    const exact = new RegExp('^' + safe + '$', 'i');
    return { ci, starts, exact };
  }

  private scoreString(val: string | undefined | null, rx: { ci: RegExp; starts: RegExp; exact: RegExp }, weight = 1) {
    if (!val) return 0;
    if (rx.exact.test(val)) return 100 * weight;
    if (rx.starts.test(val)) return 40 * weight;
    if (rx.ci.test(val)) return 15 * weight;
    return 0;
  }

  private scoreArray(arr: string[] | undefined, rx: { ci: RegExp; starts: RegExp; exact: RegExp }, weight = 1) {
    if (!arr || !arr.length) return 0;
    return Math.max(...arr.map((s) => this.scoreString(s, rx, weight)));
  }

  // ===== USERS =====
  private async searchUsers(q: string, limit: number): Promise<UserHit[]> {
    const rx = this.buildRegexes(q);

    const pipeline: PipelineStage[] = [
      {
        $lookup: {
          from: 'user_profiles',
          localField: '_id',
          foreignField: 'userId',
          as: 'profile',
        },
      },
      { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
      {
        $match: {
          $or: [
            { 'profile.displayName': { $regex: rx.ci } },
            { name: { $regex: rx.ci } },
            { username: { $regex: rx.ci } },
            { email: { $regex: rx.ci } },
          ],
        },
      },
      {
        $project: {
          username: 1,
          email: 1,
          role: 1,
          name: 1,
          avatarUrl: 1, // з User (fallback)
          'profile.displayName': 1,
          'profile.avatarUrl': 1, // з UserProfile (primary)
        },
      },
      { $limit: limit * 3 },
    ];

    const raw = await (this.userModel as any).aggregate(pipeline);

    // Порахуємо кількість кейсів на користувача (own або contributor), тільки published
    const userIds = raw.map((r: any) => r._id);
    const countsAgg = await this.caseModel.aggregate([
      {
        $match: {
          status: 'published',
          $or: [
            { ownerId: { $in: userIds } },
            { 'contributors.userId': { $in: userIds } },
          ],
        },
      },
      {
        $project: {
          owners: {
            $setUnion: [
              { $cond: [{ $ifNull: ['$ownerId', false] }, ['$ownerId'], []] },
              {
                $map: {
                  input: { $ifNull: ['$contributors', []] },
                  as: 'c',
                  in: '$$c.userId',
                },
              },
            ],
          },
        },
      },
      { $unwind: '$owners' },
      { $group: { _id: '$owners', count: { $sum: 1 } } },
    ]);
    const counts = new Map<string, number>(countsAgg.map((x) => [String(x._id), x.count]));

    const scored: UserHit[] = raw.map((u: any) => {
      const disp = u.profile?.displayName ?? u.name ?? null;
      const avatar = u.profile?.avatarUrl ?? u.avatarUrl ?? null;

      const base =
        this.scoreString(disp, rx, 1.3) +
        this.scoreString(u.username, rx, 1.6) +
        this.scoreString(u.email, rx, 1.1) +
        this.scoreString(u.name, rx, 1.2);

      const isPro = u.role === 'pro';
      const proBonus = isPro ? 8 : 0;
      const caseCount = counts.get(String(u._id)) ?? 0;
      const countBonus = Math.log2(caseCount + 1) * 3;

      return {
        _id: u._id,
        username: u.username ?? null,
        email: u.email ?? null,
        role: u.role ?? null,
        name: u.name ?? null,
        displayName: disp,
        avatarUrl: avatar,
        caseCount,
        score: base + proBonus + countBonus,
      };
    });

    scored.sort((a, b) => b.score - a.score || (b.caseCount ?? 0) - (a.caseCount ?? 0));
    return scored.slice(0, limit);
  }

  // ===== CASES =====
  private async searchCases(q: string, limit: number): Promise<CaseHit[]> {
    const rx = this.buildRegexes(q);

    const pipeline: PipelineStage[] = [
      { $match: { status: 'published' } },
      // приєднуємо власника
      {
        $lookup: {
          from: 'users',
          localField: 'ownerId',
          foreignField: '_id',
          as: 'owner',
        },
      },
      { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
      // і його профіль
      {
        $lookup: {
          from: 'user_profiles',
          localField: 'owner._id',
          foreignField: 'userId',
          as: 'ownerProfile',
        },
      },
      { $unwind: { path: '$ownerProfile', preserveNullAndEmptyArrays: true } },
      // фільтр по назві/категоріях/імені автора/юзернейму автора
      {
        $match: {
          $or: [
            { title: { $regex: rx.ci } },
            { categories: { $regex: rx.ci } },
            { 'owner.username': { $regex: rx.ci } },
            { 'owner.email': { $regex: rx.ci } },
            { 'owner.name': { $regex: rx.ci } },
            { 'ownerProfile.displayName': { $regex: rx.ci } },
          ],
        },
      },
      {
        $project: {
          title: 1,
          categories: 1,
          ownerId: 1,
          coverUrl: '$cover.url',
          authorName: {
            $ifNull: ['$ownerProfile.displayName', { $ifNull: ['$owner.name', '$owner.username'] }],
          },
          views: 1,
          createdAt: 1,
        },
      },
      { $limit: limit * 3 },
    ];

    const raw = await (this.caseModel as any).aggregate(pipeline);

    const scored: CaseHit[] = raw.map((c: any) => {
      const s =
        this.scoreString(c.title, rx, 1.8) +
        this.scoreArray(c.categories || [], rx, 1.0) +
        this.scoreString(c.authorName, rx, 1.2);

      const bonus = (c.views || 0) * 0.0005;
      return {
        _id: c._id,
        title: c.title,
        coverUrl: c.coverUrl ?? null,
        authorId: c.ownerId ?? null,
        authorName: c.authorName ?? null,
        categories: c.categories ?? [],
        score: s + bonus,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  // ===== BOTS =====
  private async searchBots(q: string, limit: number): Promise<BotHit[]> {
    try {
      const result = await this.botProfileService.searchBots({
        username: q,
        limit: limit * 3, // Більше результатів для подальшого сортування
      });

      const rx = this.buildRegexes(q);

      const scored: BotHit[] = result.bots.map((bot) => {
        const baseScore =
          this.scoreString(bot.username, rx, 1.5) +
          this.scoreString(bot.email, rx, 1.1);

        // Додаткові бонуси за активність
        const activityBonus = Math.min(bot.botData.activityCount / 10, 20);
        const statusBonus = bot.botData.status === 'active' ? 15 : 0;
        const canVoteBonus = bot.botData.canVote ? 10 : 0;
        const hasAvatarBonus = bot.botData.hasAvatar ? 5 : 0;

        const totalScore = baseScore + activityBonus + statusBonus + canVoteBonus + hasAvatarBonus;

        return {
          _id: new Types.ObjectId(bot.id),
          username: bot.username,
          email: bot.email,
          avatar: bot.avatar,
          isBot: true,
          botData: bot.botData,
          score: totalScore,
        };
      });

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit);
    } catch (error) {
      console.error('Error searching bots:', error);
      return [];
    }
  }

  // ===== PUBLIC API =====
  async search(params: SearchQueryDto) {
    const q = (params.q || '').trim();
    const limit = params.limit ?? 10;
    const type = params.type ?? 'all';

    if (!q) {
      return { q, users: [], cases: [], bots: [], background: null };
    }

    const wantUsers = type === 'all' || type === 'users';
    const wantCases = type === 'all' || type === 'cases';
    // Виправлення: використовуємо приведення типів, оскільки SearchQueryDto може не містити 'bots'
    const wantBots = type === 'all' || (type as string) === 'bots';

    const [users, cases, bots] = await Promise.all([
      wantUsers ? this.searchUsers(q, limit) : Promise.resolve([] as UserHit[]),
      wantCases ? this.searchCases(q, limit) : Promise.resolve([] as CaseHit[]),
      wantBots ? this.searchBots(q, limit) : Promise.resolve([] as BotHit[]),
    ]);

    // вибір фону за релевантністю
    const topUser = users[0];
    const topCase = cases[0];
    const topBot = bots[0];
    
    let background: { kind: 'user' | 'case' | 'bot'; url: string | null } | null = null;
    
    // Знаходимо найрелевантніший результат
    const allTopResults = [
      { type: 'user', score: topUser?.score || 0, url: topUser?.avatarUrl || null },
      { type: 'case', score: topCase?.score || 0, url: topCase?.coverUrl || null },
      { type: 'bot', score: topBot?.score || 0, url: topBot?.avatar || null },
    ];

    const topResult = allTopResults.reduce((prev, current) => 
      (prev.score > current.score) ? prev : current
    );

    if (topResult.score > 0) {
      background = {
        kind: topResult.type as 'user' | 'case' | 'bot',
        url: topResult.url,
      };
    }

    return {
      q,
      users: users.map((u) => ({
        id: String(u._id),
        displayName: u.displayName ?? u.name ?? u.username ?? u.email ?? 'User',
        username: u.username ?? null,
        email: u.email ?? null,
        isPro: u.role === 'pro',
        caseCount: u.caseCount ?? 0,
        avatarUrl: u.avatarUrl ?? null,
        _score: Math.round(u.score),
      })),
      cases: cases.map((c) => ({
        id: String(c._id),
        title: c.title,
        authorId: c.authorId ? String(c.authorId) : null,
        authorName: c.authorName ?? null,
        categories: c.categories ?? [],
        coverUrl: c.coverUrl ?? null,
        _score: Math.round(c.score),
      })),
      bots: bots.map((b) => ({
        id: String(b._id),
        username: b.username,
        email: b.email,
        avatar: b.avatar,
        isBot: true,
        botData: b.botData,
        _score: Math.round(b.score),
      })),
      background,
    };
  }

  // Новий метод для пошуку тільки ботів
  async searchOnlyBots(params: SearchQueryDto) {
    const q = (params.q || '').trim();
    const limit = params.limit ?? 10;

    if (!q) {
      return { q, bots: [] };
    }

    const bots = await this.searchBots(q, limit);

    return {
      q,
      bots: bots.map((b) => ({
        id: String(b._id),
        username: b.username,
        email: b.email,
        avatar: b.avatar,
        isBot: true,
        botData: b.botData,
        _score: Math.round(b.score),
      })),
    };
  }
}