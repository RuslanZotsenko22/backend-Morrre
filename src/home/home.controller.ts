import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
    private readonly home: HomeService,
  ) {}

  private readonly ttlMs = 180_000; // 3 хв
  private readonly keyLanding = 'home:landing:v1';

  /** GET /api/home — головна збірка (кешована) */
  @Get()
  async landing() {
    const hit = await this.cache.get<any>(this.keyLanding);
    if (hit) return hit;

    const [featuredCollections, popularSlides, discover] = await Promise.all([
      this.collections.getFeatured(6),
      this.cases.getPopularSlides(6),
      this.cases.discoverCases({ limit: 12 }),
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

  /** GET /home/popular — усі кейси у популярному розділі (пагінація) */
  @Get('popular')
  async popular(
    @Query('limit') limit = '12',
    @Query('page') page = '1',
  ) {
    const n = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 48);
    const p = Math.max(parseInt(page, 10) || 1, 1);
    const data = await this.home.getPopular({ limit: n, page: p });
    return data;
  }

  /** GET /home/collections — колекції (featured або всі, пагінація) */
  @Get('collections')
  async collectionsList(
    @Query('featuredOnly') featuredOnly = 'true',
    @Query('limit') limit = '6',
    @Query('page') page = '1',
  ) {
    const n = Math.min(Math.max(parseInt(limit, 10) || 6, 1), 24);
    const p = Math.max(parseInt(page, 10) || 1, 1);
    const featured = featuredOnly === 'false' ? false : true;
    const data = await this.home.getCollections({
      featuredOnly: featured,
      limit: n,
      page: p,
    });
    return data;
  }

  /** Popular today (слайди) — ручний вибір у CMS (featuredSlides=true) */
  @Get('popular-today')
  async popularToday(@Query('limit') limit = '6') {
    const n = Math.min(Math.max(parseInt(limit, 10) || 6, 1), 12);
    const items = await this.cases.getPopularSlides(n);
    return { items };
  }

  /** Discover — список кейсів з пагінацією та опціональним фільтром по категорії */
  @Get('discover')
  async discover(
    @Query('category') category?: string,
    @Query('limit') limit = '12',
    @Query('page') page = '1',
  ) {
    const l = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 48);
    const p = Math.max(parseInt(page, 10) || 1, 1);
    return this.home.getDiscover({ category, limit: l, page: p });
  }

  // ===============================
  // Curated Queue (Popular)
  // ===============================

  @Post('queue/:caseId')
  async addToQueue(@Param('caseId') caseId: string) {
    const item = await this.home.addCaseToPopularQueue(caseId);
    return { item };
  }

  @Get('queue')
  async listQueue(@Query('status') status?: 'queued' | 'published') {
    const items = await this.home.listPopularQueue(status);
    return { items };
  }

  @Patch('queue/:id')
  async updateQueueItem(
    @Param('id') id: string,
    @Body() dto: UpdateQueueItemDto,
  ) {
    const item = await this.home.updatePopularQueueItem(id, dto);
    return { item };
  }

  @Post('queue/:caseId/publish-now')
  async publishNow(@Param('caseId') caseId: string) {
    const res = await this.home.publishCaseToPopularNow(caseId);
    return res;
  }
}
