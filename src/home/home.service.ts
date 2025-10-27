import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { RedisCacheService } from '../common/redis/redis-cache.service';
import { CollectionsService } from '../collections/collections.service';
import { CasesService } from '../cases/cases.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PopularQueue, PopularQueueDocument } from './schemas/popular-queue.schema';

@Injectable()
export class HomeService {
  private readonly ttlMs = 180_000; // 3 хв
  private readonly keyLanding = 'home:landing:v1'; // збільш версію при зміні формату відповіді
  private readonly logger = new Logger(HomeService.name);

  constructor(
    private readonly cache: RedisCacheService,
    private readonly collections: CollectionsService,
    private readonly cases: CasesService,
    @InjectModel(PopularQueue.name) private readonly pqModel: Model<PopularQueueDocument>,
    @InjectModel('Case') private readonly caseModel: Model<any>,
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
    return { ok: true };
  }

  // ===============================
  // NEW: Daily batch (preview + publish)
  // ===============================

  /**
   * Попередній перегляд — які айтеми підуть у найближчу публікацію (forceToday попереду, далі FIFO).
   */
  async previewDailyBatch(limit = 8) {
    const items = await this.pqModel
      .find({ status: 'queued' })
      .sort({ forceToday: -1, addedAt: 1 })
      .limit(limit)
      .populate('caseId', 'title popularStatus queuedAt forceToday')
      .lean();

    return items;
  }

  /**
   * Публікація перших N айтемів (forceToday first → FIFO).
   * Ідемпотентно: оновлює тільки ті, що мають status='queued'.
   */
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
    const batchDate = new Date(pubAt.toISOString().slice(0, 10)); // північ UTC

    for (const item of batch) {
      // підстрахуємось на випадок гонки
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

    this.logger.log(`publishDailyBatch: published ${batch.length} case(s)`);
    return {
      published: batch.length,
      items: batch.map(b => ({ id: String(b._id), caseId: String(b.caseId), publishedAt: b.publishedAt })),
    };
  }
}
