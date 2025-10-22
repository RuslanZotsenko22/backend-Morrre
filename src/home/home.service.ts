import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { RedisCacheService } from '../common/redis/redis-cache.service';
import { CollectionsService } from '../collections/collections.service';
import { CasesService } from '../cases/cases.service';

// ⬇ додано для роботи з Mongo (черга PopularQueue + Case)
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PopularQueue, PopularQueueDocument } from './schemas/popular-queue.schema';

@Injectable()
export class HomeService {
  private readonly ttlMs = 180_000; // 3 хв
  private readonly keyLanding = 'home:landing:v1'; // збільш версію при зміні формату відповіді

  constructor(
    private readonly cache: RedisCacheService,
    private readonly collections: CollectionsService,
    private readonly cases: CasesService,

    // ⬇ інʼєкції моделей (не зачіпають існуючу логіку)
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
  // Curated Queue (Popular) — нове
  // ===============================

  /**
   * Додати кейс до curated-черги (FIFO).
   * - помічає Case.popularStatus='queued', Case.popularQueued=true, queuedAt=now
   * - створює запис у PopularQueue
   */
  async addCaseToPopularQueue(caseId: string) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid caseId');
    }

    const caseDoc = await this.caseModel.findById(caseId);
    if (!caseDoc) throw new NotFoundException('Case not found');

    // якщо вже queued — повертаємо існуючий
    const existing = await this.pqModel.findOne({ caseId, status: 'queued' }).lean();
    if (existing) return existing;

    // оновлюємо статуси у кейсі
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

    // створюємо елемент черги
    const created = await this.pqModel.create({
      caseId: new Types.ObjectId(caseId),
      status: 'queued',
      forceToday: false,
      addedAt: now,
    });

    // інвалід кешу головної (щоб швидше підхопити зміни)
    await this.invalidateLandingCache();

    return created;
  }

  /**
   * Отримати список елементів черги (для адмінів).
   * Можна фільтрувати за статусом 'queued' | 'published'
   */
  async listPopularQueue(status?: 'queued' | 'published') {
    const filter: any = {};
    if (status) filter.status = status;

    const items = await this.pqModel
      .find(filter)
      .sort({ forceToday: -1, addedAt: 1 }) // forceToday попереду, далі FIFO
      .populate('caseId', 'title cover authors categories popularStatus queuedAt forceToday')
      .lean();

    return items;
  }

  /**
   * Оновити елемент черги:
   * - зміна status (queued|published)
   * - виставити/зняти forceToday
   * Синхронно оновлює повʼязані поля у Case.
   */
  async updatePopularQueueItem(
    id: string,
    dto: { status?: 'queued' | 'published'; forceToday?: boolean },
  ) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid queue item id');
    const item = await this.pqModel.findById(id);
    if (!item) throw new NotFoundException('Queue item not found');

    // forceToday
    if (typeof dto.forceToday === 'boolean') {
      item.forceToday = dto.forceToday;
      // продублюємо у кейсі для швидких фільтрів/сорту
      await this.caseModel.updateOne({ _id: item.caseId }, { $set: { forceToday: dto.forceToday } });
    }

    // status
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
              popularBatchDate: new Date(new Date(pubAt).toISOString().slice(0, 10)), // початок доби (UTC-ish)
              popularQueued: false,
            },
          },
        );
      } else {
        // повернення в queued
        await this.caseModel.updateOne(
          { _id: item.caseId },
          { $set: { popularStatus: 'queued', popularActive: false, popularQueued: true } },
        );
        item.publishedAt = null;
      }
    }

    await item.save();

    // інвалід кешу головної
    await this.invalidateLandingCache();

    return item;
  }

  /**
   * Швидка примусова публікація конкретного кейса (в обхід черги).
   * Використовується для екстрених випадків або UI-кнопки "Publish now".
   */
  async publishCaseToPopularNow(caseId: string) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid caseId');
    }

    const doc = await this.caseModel.findById(caseId);
    if (!doc) throw new NotFoundException('Case not found');

    const pubAt = new Date();

    // 1) Оновлюємо сам кейс
    await this.caseModel.updateOne(
      { _id: caseId },
      {
        $set: {
          popularStatus: 'published',
          popularActive: true,
          popularPublishedAt: pubAt,
          popularBatchDate: new Date(new Date(pubAt).toISOString().slice(0, 10)),
          popularQueued: false,
          forceToday: false,
        },
      },
    );

    // 2) Якщо у черзі існує queued-елемент — оновлюємо його до published
    const queued = await this.pqModel.findOne({ caseId, status: 'queued' });
    if (queued) {
      queued.status = 'published';
      queued.publishedAt = pubAt;
      queued.forceToday = false;
      await queued.save();
    } else {
      // інакше створимо published-запис для історії
      await this.pqModel.create({
        caseId: new Types.ObjectId(caseId),
        status: 'published',
        forceToday: false,
        addedAt: pubAt,
        publishedAt: pubAt,
      });
    }

    // інвалід кешу головної
    await this.invalidateLandingCache();

    return { ok: true };
  }
}
