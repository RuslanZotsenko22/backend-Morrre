import { Injectable } from '@nestjs/common'
import { RedisCacheService } from '../common/redis/redis-cache.service'
import { CollectionsService } from '../collections/collections.service'
import { CasesService } from '../cases/cases.service'

@Injectable()
export class HomeService {
  private readonly ttlMs = 180_000 // 3 хв
  private readonly keyLanding = 'home:landing:v1' // збільш версію при зміні формату відповіді

  constructor(
    private readonly cache: RedisCacheService,
    private readonly collections: CollectionsService,
    private readonly cases: CasesService,
  ) {}

  /** Публічні дані для головної */
  async getLanding() {
    const hit = await this.cache.get<any>(this.keyLanding)
    if (hit) return hit

    // Збираємо все паралельно
    const [featuredCollections, popularSlides, discover] = await Promise.all([
      this.collections.getFeatured(6),   // топ-колекції для головної
      this.cases.getPopularSlides(6),    // слайди
      this.cases.discoverCases({ limit: 12 }), // discover-грид (fallback всередині)
    ])

    const data = {
      featuredCollections,
      popularSlides,
      discover,
      ts: new Date().toISOString(),
    }

    await this.cache.set(this.keyLanding, data, this.ttlMs)
    return data
  }

  /** Інвалідація кешу головної (викликати після змін у cases/collections) */
  async invalidateLandingCache() {
    await this.cache.del(this.keyLanding)
    return { ok: true }
  }
}
