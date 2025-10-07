import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name)
  private client: Redis
  private enabled = true
  private readonly prefix = 'cms:' // щоб не змішувалось з іншим кешем

  constructor(private readonly cfg: ConfigService) {
    const url = this.cfg.get<string>('REDIS_URL') || 'redis://127.0.0.1:6379'
    try {
      this.client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableAutoPipelining: true,
      })
      // ioredis v5: є .connect()
      ;(this.client as any).connect?.().catch((e: any) => {
        this.enabled = false
        this.logger.warn(`Redis disabled: connect failed: ${e?.message || e}`)
      })

      this.client.on('error', (e) => {
        this.enabled = false
        this.logger.warn(`Redis error → disabled: ${e?.message || e}`)
      })
      this.client.on('ready', () => {
        this.enabled = true
        this.logger.log('Redis ready')
      })
    } catch (e: any) {
      this.enabled = false
      this.logger.warn(`Redis disabled at init: ${e?.message || e}`)
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (!this.enabled) return undefined
    try {
      const v = await this.client.get(this.prefix + key)
      return v ? (JSON.parse(v) as T) : undefined
    } catch {
      return undefined
    }
  }

  async set<T>(key: string, val: T, ttlMs = 300_000): Promise<void> {
    if (!this.enabled) return
    try {
      const sec = Math.max(1, Math.floor(ttlMs / 1000))
      await this.client.set(this.prefix + key, JSON.stringify(val), 'EX', sec)
    } catch {
      /* ignore */
    }
  }

  /** Видалити ключ або всі ключі з префіксом (prefixOrKey) */
  async del(prefixOrKey: string): Promise<void> {
    if (!this.enabled) return
    const full = this.prefix + prefixOrKey
    try {
      // спробуємо як точний ключ
      await this.client.del(full)
    } catch { /* ignore */ }

    // а тепер — як префікс (через SCAN)
    try {
      const stream = this.client.scanStream({ match: full + '*', count: 200 })
      const keys: string[] = []
      await new Promise<void>((resolve) => {
        stream.on('data', (batch: string[]) => { if (batch?.length) keys.push(...batch) })
        stream.on('end', async () => { if (keys.length) await this.client.del(...keys); resolve() })
        stream.on('error', () => resolve())
      })
    } catch { /* ignore */ }
  }
}
