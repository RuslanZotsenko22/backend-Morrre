// src/users/user-page.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserProfile } from './schemas/user-profile.schema';
import { UserStats } from './schemas/user-stats.schema';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { buildUserCategoriesPipeline, buildUserCasesQuery } from './queries/aggregations';
import { validateSocials, whitelistIndustry, whitelistWhatWeDid } from '../common/validators/socials.validator';

@Injectable()
export class UserPageService {
  constructor(
    @InjectModel(UserProfile.name) private profileModel: Model<UserProfile>,
    @InjectModel(UserStats.name) private statsModel: Model<UserStats>,
    @InjectModel('Case') private caseModel: Model<any>,
    @InjectModel('Follow') private followModel: Model<any>,
  ) {}

  private formatTimeSince(date?: Date | string | null): string | null {
    if (!date) return null;
    const ts = new Date(date).getTime();
    if (Number.isNaN(ts)) return null;
    const diff = Date.now() - ts;
    if (diff < 0) return '0m';
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo}mo`;
    const y = Math.floor(mo / 12);
    return `${y}y`;
  }

  async getPublicProfile(userId: Types.ObjectId, viewerId?: string) {
    const [profile, stats, categories] = await Promise.all([
      this.profileModel.findOne({ userId }).lean(),
      // 👇 підказуємо TS, що тут можуть бути додаткові поля (rating)
      this.statsModel.findOne({ userId }).lean<any>(),
      this.caseModel.aggregate(buildUserCategoriesPipeline(userId)),
    ]);

    const isFollowing = viewerId
      ? await this.followModel.exists({ followerId: new Types.ObjectId(viewerId), targetId: userId })
      : null;

    return {
      id: userId.toString(),
      displayName: profile?.displayName ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
      rating: (stats as any)?.rating ?? 0, 
      location: profile?.location ?? null,
      about: profile?.about ?? null,
      industry: profile?.industry ?? null,
      whatWeDid: profile?.whatWeDid ?? [],
      socials: profile?.socials ?? {},
      categories,
      stats: stats
        ? { votes: stats.votes, followers: stats.followers, views: stats.views, shots: stats.shots }
        : { votes: 0, followers: 0, views: 0, shots: 0 },
      memberSince: profile?.memberSince ?? null,
      isFollowing: !!isFollowing,
    };
  }

 async getUserCases(
  userId: Types.ObjectId,
  opts: { sort: 'author' | 'popular' | 'date'; categories?: string[]; limit: number; offset: number },
) {
  const limit = Math.max(1, Math.min(50, Number.isFinite(opts.limit) ? opts.limit : 12));
  const offset = Math.max(0, Number.isFinite(opts.offset) ? opts.offset : 0);

  // 🔎 якщо фронт надіслав categories — відсічемо опечатки:
  // візьмемо лише ті, що реально є у користувача (за агрегацією)
  let safeCategories = opts.categories;
  if (opts.categories && opts.categories.length > 0) {
    const catsAgg = await this.caseModel.aggregate(
      buildUserCategoriesPipeline(userId),
    ) as Array<{ name: string; count: number }>;
    const userCats = new Set(catsAgg.map(c => String(c.name).toLowerCase()));
    safeCategories = opts.categories.filter(c => userCats.has(String(c).toLowerCase()));
    if (safeCategories.length === 0) {
      // якщо жодної валідної — одразу повертаємо порожньо без зайвих запитів
      return { items: [], total: 0 };
    }
  }

  // будуємо фільтр/сорт
  const { filter, sort, caseOrder } = await buildUserCasesQuery(this.profileModel, userId, {
    ...opts,
    categories: safeCategories,
  });

  let items = (await this.caseModel
    .find(filter, { title: 1, coverUrl: 1, categories: 1, publishedAt: 1, score: 1, views: 1 })
    .sort(sort)
    .skip(offset)
    .limit(limit)
    .lean()) as any[];

  if (opts.sort === 'author') {
    const pos = new Map<string, number>((caseOrder ?? []).map((id, i) => [id.toString(), i]));
    const getTime = (d: any) => (d ? new Date(d).getTime() : 0);

    const fresh: any[] = [];
    const manual: any[] = [];

    for (const it of items) (pos.has(String(it._id)) ? manual : fresh).push(it);

    fresh.sort((a, b) => getTime(b.publishedAt) - getTime(a.publishedAt));
    manual.sort((a, b) => (pos.get(String(a._id))! - pos.get(String(b._id))!));
    items = [...fresh, ...manual];
  }

  items = items.map((it) => ({
    ...it,
    timeSince: this.formatTimeSince(it.publishedAt),
  }));

  const total = await this.caseModel.countDocuments(filter);
  return { items, total };
}

  async updateProfile(userId: Types.ObjectId, dto: UpdateProfileDto) {
    if (dto.socials) dto.socials = validateSocials(dto.socials as any);
    if (dto.industry) whitelistIndustry(dto.industry);
    if (dto.whatWeDid) whitelistWhatWeDid(dto.whatWeDid);

    return this.profileModel
      .findOneAndUpdate({ userId }, { $set: { ...dto } }, { new: true, upsert: true })
      .lean();
  }

  async setCaseOrder(userId: Types.ObjectId, caseIds: string[]) {
    const ids = caseIds.map((id) => new Types.ObjectId(id));
    await this.profileModel.updateOne({ userId }, { $set: { caseOrder: ids } }, { upsert: true });
    return { ok: true };
  }

  async getUserStats(userId: Types.ObjectId) {
    return this.statsModel.findOne({ userId }).lean();
  }

  async getFollowState(targetId: Types.ObjectId, viewerId?: string) {
    if (!viewerId) return { isFollowing: false };
    const ex = await this.followModel.exists({ followerId: new Types.ObjectId(viewerId), targetId });
    return { isFollowing: !!ex };
  }
}
