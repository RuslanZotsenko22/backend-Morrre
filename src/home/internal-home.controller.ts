import { Controller, Headers, Post, UnauthorizedException } from '@nestjs/common'
import { RedisCacheService } from '../common/redis/redis-cache.service'

@Controller('internal/home') // -> /api/internal/home/...
export class InternalHomeController {
  private readonly keyLanding = 'home:landing:v1'

  constructor(private readonly cache: RedisCacheService) {}

  /** POST /api/internal/home/invalidate-landing  (X-Internal-Secret required) */
  @Post('invalidate-landing')
  async invalidateLanding(@Headers('x-internal-secret') secret?: string) {
    if (!secret || secret !== process.env.INTERNAL_SECRET) {
      throw new UnauthorizedException('Invalid internal secret')
    }
    await this.cache.del(this.keyLanding)
    return { ok: true }
  }
}
