import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { RedisCacheService } from '../common/redis/redis-cache.service';
import { CollectionsService } from '../collections/collections.service';
import { CasesService } from '../cases/cases.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PopularQueue, PopularQueueDocument } from './schemas/popular-queue.schema';

@Injectable()
export class HomeService {
  private readonly ttlMs = 180_000; 
  private readonly keyLanding = 'home:landing:v1'; 
  private readonly logger = new Logger(HomeService.name);

  
  private readonly keyPopular = (page: number, limit: number) =>
    `home:popular:v1:p${page}:l${limit}`;
  private readonly keyCollections = (featuredOnly: boolean, page: number, limit: number) =>
    `home:collections:v1:f${featuredOnly ? 1 : 0}:p${page}:l${limit}`;
  private readonly keyDiscover = (category: string | undefined, page: number, limit: number) =>
    `home:discover:v1:c${category ?? 'all'}:p${page}:l${limit}`;

  constructor(
    private readonly cache: RedisCacheService,
    private readonly collections: CollectionsService,
    private readonly cases: CasesService,
    @InjectModel(PopularQueue.name) private readonly pqModel: Model<PopularQueueDocument>,
    @InjectModel('Case') private readonly caseModel: Model<any>,
    @InjectModel('Collection') private readonly collectionModel: Model<any>, 
  ) {}

  /** Публічні дані для головної */
  async getLanding() {
    const hit = await this.cache.get<any>(this.keyLanding);
    if (hit) return hit;

    // Збираємо все паралельно
    const [featuredCollections, popularSlides, discover] = await Promise.all([
      this.collections.getFeatured(6), // топ-колекції для головної
      this.cases.getPopularSlides(6),  // слайди
      this.cases.discoverCases({ limit: 12 }), // discover-грид (fallback всередині)
    ]);

    const data = {
      featuredCollections,
      popularSlides,
      discover,
      ts: new Date().toISOString(),
    };

    await this.cache.set(this.keyLanding, data, this.ttlMs);
    return data;
  }

  /** Інвалідація кешу головної (викликати після змін у cases/collections) */
  async invalidateLandingCache() {
    await this.cache.del(this.keyLanding);
    return { ok: true };
  }

 
  async getDiscover({
    category,
    limit,
    page,
  }: {
    category?: string;
    limit: number;
    page: number;
  }) {
    const key = this.keyDiscover(category, page, limit);
    const hit = await this.cache.get<any>(key);
    if (hit) return hit;

    const skip = (page - 1) * limit;
    const filter: any = { status: 'published' };
    if (category) filter.categories = { $in: [category] };

    const [items, total] = await Promise.all([
      this.caseModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.caseModel.countDocuments(filter),
    ]);

    const data = { items, page, limit, total };
    await this.cache.set(key, data, this.ttlMs);
    return data;
  }

  // ===============================
  // Collections списки (для /home/popular і /home/collections)
  // ===============================

  /** GET /home/popular — активні кейси популярного розділу (пагінація) */
  async getPopular({ limit, page }: { limit: number; page: number }) {
    const key = this.keyPopular(page, limit);
    const hit = await this.cache.get<any>(key);
    if (hit) return hit;

    const skip = (page - 1) * limit;

    // Показуємо лише опубліковані в Popular
    const filter: any = { popularActive: true };

    // Сортування батчів: спершу найсвіжіший день, далі час публікації в межах дня
    const sort = { popularBatchDate: -1, popularPublishedAt: -1, _id: -1 } as const;

    const [items, total] = await Promise.all([
      this.caseModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      this.caseModel.countDocuments(filter),
    ]);

    const data = { items, page, limit, total };
    await this.cache.set(key, data, this.ttlMs);
    return data;
  }

  /** GET /home/collections — колекції (featuredOnly=true за замовчуванням) з пагінацією */
  async getCollections({
    featuredOnly,
    limit,
    page,
  }: {
    featuredOnly: boolean;
    limit: number;
    page: number;
  }) {
    const key = this.keyCollections(featuredOnly, page, limit);
    const hit = await this.cache.get<any>(key);
    if (hit) return hit;

    const skip = (page - 1) * limit;

    const filter: any = {};
    if (featuredOnly) filter.featured = true;

   
    const sort = { order: 1, createdAt: -1 } as const;

    const [items, total] = await Promise.all([
      this.collectionModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      this.collectionModel.countDocuments(filter),
    ]);

    const data = { items, page, limit, total };
    await this.cache.set(key, data, this.ttlMs);
    return data;
  }

  // ===============================
  // Curated Queue (Popular)
  // ===============================

  async addCaseToPopularQueue(caseId: string) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid caseId');
    }

    const caseDoc = await this.caseModel.findById(caseId);
    if (!caseDoc) throw new NotFoundException('Case not found');

    // якщо вже queued — повертаємо існуючий
    const existing = await this.pqModel.findOne({ caseId, status: 'queued' }).lean();
    if (existing) return existing;

    const now = new Date();
    await this.caseModel.updateOne(
      { _id: caseId },
      {
        $set: {
          popularStatus: 'queued',
          popularQueued: true,
          queuedAt: now,
          forceToday: false,
        },
      },
    );

    const created = await this.pqModel.create({
      caseId: new Types.ObjectId(caseId),
      status: 'queued',
      forceToday: false,
      addedAt: now,
    });

    await this.invalidateLandingCache();
    
    try {
      await (this.cache as any).delByPattern?.('home:popular:v1:*');
      await (this.cache as any).delByPattern?.('home:collections:v1:*');
      await (this.cache as any).delByPattern?.('home:discover:v1:*');
    } catch {}

    return created;
  }

  async listPopularQueue(status?: 'queued' | 'published') {
    const filter: any = {};
    if (status) filter.status = status;

    const items = await this.pqModel
      .find(filter)
      .sort({ forceToday: -1, addedAt: 1 })
      .populate('caseId', 'title cover authors categories popularStatus queuedAt forceToday')
      .lean();

    return items;
  }

  async updatePopularQueueItem(
    id: string,
    dto: { status?: 'queued' | 'published'; forceToday?: boolean },
  ) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid queue item id');
    const item = await this.pqModel.findById(id);
    if (!item) throw new NotFoundException('Queue item not found');

    if (typeof dto.forceToday === 'boolean') {
      item.forceToday = dto.forceToday;
      await this.caseModel.updateOne({ _id: item.caseId }, { $set: { forceToday: dto.forceToday } });
    }

    if (dto.status) {
      item.status = dto.status;
      if (dto.status === 'published') {
        const pubAt = new Date();
        item.publishedAt = pubAt;
        await this.caseModel.updateOne(
          { _id: item.caseId },
          {
            $set: {
              popularStatus: 'published',
              popularActive: true,
              popularPublishedAt: pubAt,
              // batchDate як північ UTC
              popularBatchDate: new Date(pubAt.toISOString().slice(0, 10)),
              popularQueued: false,
              forceToday: false,
            },
          },
        );
      } else {
        await this.caseModel.updateOne(
          { _id: item.caseId },
          { $set: { popularStatus: 'queued', popularActive: false, popularQueued: true } },
        );
        item.publishedAt = null;
      }
    }

    await item.save();
    await this.invalidateLandingCache();
    try {
      await (this.cache as any).delByPattern?.('home:popular:v1:*');
      await (this.cache as any).delByPattern?.('home:collections:v1:*');
      await (this.cache as any).delByPattern?.('home:discover:v1:*');
    } catch {}
    return item;
  }

  async publishCaseToPopularNow(caseId: string) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid caseId');
    }

    const doc = await this.caseModel.findById(caseId);
    if (!doc) throw new NotFoundException('Case not found');

    const pubAt = new Date();

    await this.caseModel.updateOne(
      { _id: caseId },
      {
        $set: {
          popularStatus: 'published',
          popularActive: true,
          popularPublishedAt: pubAt,
          popularBatchDate: new Date(pubAt.toISOString().slice(0, 10)),
          popularQueued: false,
          forceToday: false,
        },
      },
    );

    const queued = await this.pqModel.findOne({ caseId, status: 'queued' });
    if (queued) {
      queued.status = 'published';
      queued.publishedAt = pubAt;
      queued.forceToday = false;
      await queued.save();
    } else {
      await this.pqModel.create({
        caseId: new Types.ObjectId(caseId),
        status: 'published',
        forceToday: false,
        addedAt: pubAt,
        publishedAt: pubAt,
      });
    }

    await this.invalidateLandingCache();
    try {
      await (this.cache as any).delByPattern?.('home:popular:v1:*');
      await (this.cache as any).delByPattern?.('home:collections:v1:*');
      await (this.cache as any).delByPattern?.('home:discover:v1:*');
    } catch {}
    return { ok: true };
  }

  // ===============================
  //  Daily batch (preview + publish)
  // ===============================

  
  async previewDailyBatch(limit = 8) {
    const items = await this.pqModel
      .find({ status: 'queued' })
      .sort({ forceToday: -1, addedAt: 1 })
      .limit(limit)
      .populate('caseId', 'title popularStatus queuedAt forceToday')
      .lean();

    return items;
  }

  
  async publishDailyBatch(limit = 8) {
    const batch = await this.pqModel
      .find({ status: 'queued' })
      .sort({ forceToday: -1, addedAt: 1 })
      .limit(limit);

    if (!batch.length) {
      this.logger.log(`publishDailyBatch: nothing to publish`);
      return { published: 0, items: [] };
    }

    const pubAt = new Date();
    const batchDate = new Date(pubAt.toISOString().slice(0, 10)); 

    for (const item of batch) {
      
      if (item.status !== 'queued') continue;

      item.status = 'published';
      item.publishedAt = pubAt;
      item.forceToday = false;
      await item.save();

      await this.caseModel.updateOne(
        { _id: item.caseId },
        {
          $set: {
            popularStatus: 'published',
            popularActive: true,
            popularPublishedAt: pubAt,
            popularBatchDate: batchDate,
            popularQueued: false,
            forceToday: false,
          },
        },
      );
    }

    await this.invalidateLandingCache();
    try {
      await (this.cache as any).delByPattern?.('home:popular:v1:*');
      await (this.cache as any).delByPattern?.('home:collections:v1:*');
      await (this.cache as any).delByPattern?.('home:discover:v1:*');
    } catch {}

    this.logger.log(`publishDailyBatch: published ${batch.length} case(s)`);
    return {
      published: batch.length,
      items: batch.map(b => ({ id: String(b._id), caseId: String(b.caseId), publishedAt: b.publishedAt })),
    };
  }
}
