import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CasesService } from '../cases/cases.service';
import { CollectionsService } from '../collections/collections.service';
import { RedisCacheService } from '../common/redis/redis-cache.service';
import { HomeService } from './home.service';
import { UpdateQueueItemDto } from './dto/update-queue-item.dto';

@Controller('home')
export class HomeController {
  constructor(
    private readonly cases: CasesService,
    private readonly collections: CollectionsService,
    private readonly cache: RedisCacheService,
    private readonly home: HomeService, // ⬅ додано для роботи з curated-чергою
  ) {}

  private readonly ttlMs = 180_000; // 3 хв
  private readonly keyLanding = 'home:landing:v1';

  /** GET /api/home — головна збірка (кешована) */
  @Get()
  async landing() {
    const hit = await this.cache.get<any>(this.keyLanding);
    if (hit) return hit;

    const [featuredCollections, popularSlides, discover] = await Promise.all([
      this.collections.getFeatured(6),           // з кешем у CollectionsService
      this.cases.getPopularSlides(6),            // з кешем у CasesService
      this.cases.discoverCases({ limit: 12 }),   // з кешем у CasesService
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

  /**
   * Popular today (слайди) — ручний вибір у CMS (featuredSlides=true), 3..6
   * ➜ тепер використовує кешований getPopularSlides()
   */
  @Get('popular-today')
  async popularToday(@Query('limit') limit = '6') {
    const n = Math.min(Math.max(parseInt(limit, 10) || 6, 1), 12);
    const items = await this.cases.getPopularSlides(n);
    return { items };
  }

  /**
   * Discover — повертає останній опублікований батч (popularBatchDate)
   * опційно фільтр за категорією
   * ➜ тепер використовує кешований discoverCases()
   */
  @Get('discover')
  async discover(@Query('category') category?: string, @Query('limit') limit = '8') {
    const n = Math.min(Math.max(parseInt(limit, 10) || 8, 1), 24);
    const items = await this.cases.discoverCases({ category, limit: n });
    return { items };
  }

  // ===============================
  // Curated Queue (Popular) — нове
  // ===============================

  /** POST /home/queue/:caseId — додати кейс у curated-чергу */
  @Post('queue/:caseId')
  async addToQueue(@Param('caseId') caseId: string) {
    const item = await this.home.addCaseToPopularQueue(caseId);
    return { item };
  }

  /** GET /home/queue?status=queued|published — список елементів черги (для адмінів) */
  @Get('queue')
  async listQueue(@Query('status') status?: 'queued' | 'published') {
    const items = await this.home.listPopularQueue(status);
    return { items };
  }

  /** PATCH /home/queue/:id — оновити елемент черги (status/forceToday) */
  @Patch('queue/:id')
  async updateQueueItem(@Param('id') id: string, @Body() dto: UpdateQueueItemDto) {
    const item = await this.home.updatePopularQueueItem(id, dto);
    return { item };
  }

  /**
   * POST /home/queue/:caseId/publish-now — примусово опублікувати кейс у Popular (поза чергою)
   * зручно як "екстрена" кнопка в адмінці
   */
  @Post('queue/:caseId/publish-now')
  async publishNow(@Param('caseId') caseId: string) {
    const res = await this.home.publishCaseToPopularNow(caseId);
    return res;
  }
}
