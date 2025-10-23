import { Controller, Headers, Post, UnauthorizedException, Get, Body, Query } from '@nestjs/common';
import { RedisCacheService } from '../common/redis/redis-cache.service';
import { HomeService } from './home.service';


@Controller('internal/home') 
export class InternalHomeController {
  private readonly keyLanding = 'home:landing:v1';

  constructor(
    private readonly cache: RedisCacheService,
    private readonly home?: HomeService, 
  ) {}

  
  @Post('invalidate-landing')
  async invalidateLanding(@Headers('x-internal-secret') secret?: string) {
    if (!secret || secret !== process.env.INTERNAL_SECRET) {
      throw new UnauthorizedException('Invalid internal secret');
    }
    await this.cache.del(this.keyLanding);
    return { ok: true };
  }

  // ===========================================================
  //  внутрішні ендпоїнти для Popular Queue
  // ===========================================================

  
  @Get('popular/preview')
  async previewBatch(
    @Headers('x-internal-secret') secret?: string,
    @Query('limit') limit = '8',
  ) {
    if (!secret || secret !== process.env.INTERNAL_SECRET) {
      throw new UnauthorizedException('Invalid internal secret');
    }
    if (!this.home) return { ok: false, error: 'HomeService not initialized' };
    const n = Math.max(1, Math.min(parseInt(limit, 10) || 8, 50));
    const items = await this.home.previewDailyBatch(n);
    return { ok: true, limit: n, items };
  }

 
  @Post('popular/publish-daily')
  async publishDaily(
    @Headers('x-internal-secret') secret?: string,
    @Body() body: { limit?: number; dryRun?: boolean } = {},
  ) {
    if (!secret || secret !== process.env.INTERNAL_SECRET) {
      throw new UnauthorizedException('Invalid internal secret');
    }
    if (!this.home) return { ok: false, error: 'HomeService not initialized' };
    const n = Math.max(1, Math.min(Number(body.limit ?? 8) || 8, 50));
    if (body.dryRun) {
      const items = await this.home.previewDailyBatch(n);
      return { dryRun: true, limit: n, items };
    }
    const res = await this.home.publishDailyBatch(n);
    return { dryRun: false, ...res };
  }

 
  @Post('popular/add/:caseId')
  async addToQueue(
    @Headers('x-internal-secret') secret?: string,
    @Query('caseId') caseId?: string,
  ) {
    if (!secret || secret !== process.env.INTERNAL_SECRET) {
      throw new UnauthorizedException('Invalid internal secret');
    }
    if (!caseId) return { ok: false, error: 'Missing caseId' };
    if (!this.home) return { ok: false, error: 'HomeService not initialized' };
    const item = await this.home.addCaseToPopularQueue(caseId);
    return { ok: true, item };
  }
}
