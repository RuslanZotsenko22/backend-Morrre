// src/internal/internal.controller.ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
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
    // res: { published: number; batchDate: Date }
    return res;
  }
}
