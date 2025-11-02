
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { InternalSecretGuard } from '../common/guards/internal-secret.guard';
import { SyncCaseDto } from '../cases/dto/sync-case.dto';
import { VideoQueue } from '../queue/video.queue';
import { CasesService } from '../cases/cases.service';

@Controller('internal')
@UseGuards(InternalSecretGuard)
export class InternalController {
  constructor(
    private readonly videoQueue: VideoQueue,
    private readonly cases: CasesService,
  ) {}

  /** Те, що було раніше — тригер синху з воркером */
  @Post('cases/sync')
  async syncCase(@Body() dto: SyncCaseDto) {
    await this.videoQueue.enqueueSyncCase({ id: dto.id });
    return { ok: true };
  }

  /** Додати кейс у curated-чергу (forceToday — опційно) */
  @Post('cases/curate')
  async curate(@Body() body: { id: string; forceToday?: boolean }) {
    const { id, forceToday } = body || ({} as any);
    await this.cases.addToCuratedQueue({ id, forceToday });
    return { ok: true };
  }

  /** Опублікувати добовий батч популярних кейсів (N за раз, дефолт 8) */
  @Post('cases/publish-daily-popular')
  async publishDailyPopular(@Body() body: { limit?: number }) {
    const limit = Number(body?.limit) || 8;
    const res = await this.cases.publishDailyPopularBatch(limit);
    return res; // { published, batchDate }
  }

  /**
   * Зняти кейс з Popular.
   * Body: { id: string; returnToQueue?: boolean }
   */
  @Post('cases/unpublish-from-popular')
  async unpublishFromPopular(
    @Body() body: { id: string; returnToQueue?: boolean },
  ) {
    const { id, returnToQueue = false } = body ?? {};
    const res = await this.cases.unpublishFromPopular(id, { returnToQueue });
    return { ok: true, modified: res.modified };
  }

  /** Ручний decay зараз (для дебагу) */
  @Post('popular/decay-now')
  async decayNow(@Body() body: { decay?: number; onlyPopular?: boolean }) {
    const res = await this.cases.decayLifeScoresHourly({
      decay: body?.decay,
      onlyPopular: body?.onlyPopular ?? true,
    });
    return { ok: true, ...res };
  }

  /** Накрутити engagement і підвищити lifeScore (MVP) */
  @Post('cases/engage')
  async engage(
    @Body()
    body: { id: string; views?: number; saves?: number; shares?: number; refsLikes?: number },
  ) {
    const { id, ...inc } = body ?? ({} as any);
    const res = await this.cases.bumpEngagement(id, inc);
    return { ok: true, lifeScore: res.lifeScore };
  }

  /** =====  admin endpoints для Popular/Slides ===== */

  /** Тогл для featuredSlides (слайди на головній) */
  @Post('cases/feature-slide')
  async featureSlide(@Body() body: { id: string; featured: boolean }) {
    const { id, featured } = body ?? ({} as any);
    const res = await this.cases.setFeaturedSlide(id, !!featured);
    return res; // { ok, featuredSlides }
  }

  /** Список queued-черги (для адмінки) */
  @Get('popular/queue')
  async getQueue(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const res = await this.cases.listCuratedQueue({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return res; // { items, total, limit, offset }
  }

  /** Список активних у Popular (останні батчі) */
  @Get('popular/active')
  async getActive(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('batchDate') batchDate?: string, // опційно фільтр по даті батча
  ) {
    const res = await this.cases.listPopularActive({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      batchDate,
    });
    return res; // { items, total, limit, offset }
  }
}
