import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CasesService } from '../cases/cases.service';

/**
 * Щоденна публікація N кейсів із curated-черги у Popular.
 */
@Injectable()
export class PopularScheduler {
  private readonly log = new Logger('PopularScheduler');

  constructor(private readonly cases: CasesService) {}

  // Кожен день о 09:00 за Києвом. За потреби змінюй.
  @Cron('0 9 * * *', { timeZone: 'Europe/Kyiv' })
  async dailyPublish() {
    const N = Number(process.env.POPULAR_BATCH_SIZE ?? 8);
    this.log.log(`Running daily publish for N=${N}`);
    const res = await this.cases.publishDailyPopularBatch(N);
    this.log.log(`Published=${res.published}, batchDate=${res.batchDate?.toISOString()}`);
  }

  // Щогодини знижуємо lifeScore у popular (можеш зробити */30 * * * * для кожні 30 хв)
  @Cron('0 * * * *', { timeZone: 'Europe/Kyiv' })
  async hourlyDecay() {
    const DEC = Number(process.env.LIFE_DECAY_PER_HOUR ?? 5);
    this.log.log(`Running hourly lifeScore decay DEC=${DEC}`);
    const res = await this.cases.decayLifeScoresHourly({ onlyPopular: true, decay: DEC });
    this.log.log(`Decay matched=${res.matched}, modified=${res.modified}`);

    try {
    const off = await this.cases.unpublishDeadPopular();
    if (off.modified > 0) {
      this.log.log(`Unpublished from Popular due to lifeScore<=0: modified=${off.modified}`);
    }
  } catch (e) {
    this.log.error(`unpublishDeadPopular failed: ${e instanceof Error ? e.message : e}`);
  }
  }

  // =========================
  //  Fallback-крон
  // =========================

  
  @Cron(process.env.POPULAR_CRON_FALLBACK || '5 3 * * *', {
    timeZone: process.env.POPULAR_TZ_FALLBACK || 'Europe/Prague',
  })
  async dailyPublishFallback() {
    if (String(process.env.POPULAR_FALLBACK_ENABLED || '').toLowerCase() !== 'true') {
      // вимкнено — тихо виходимо
      return;
    }

    const limit = Number(process.env.POPULAR_BATCH_SIZE ?? 8) || 8;
    const baseUrl = process.env.NEST_API_URL || 'http://localhost:4000';
    const secret = process.env.INTERNAL_SECRET;

    if (!secret) {
      this.log.warn('POPULAR_FALLBACK_ENABLED=true, але INTERNAL_SECRET не заданий — пропускаю.');
      return;
    }

    const url = `${baseUrl}/internal/popular/publish-daily`;
    this.log.log(`Fallback cron: POST ${url} (limit=${limit})`);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': secret,
        },
        body: JSON.stringify({ limit, dryRun: false }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.log.error(`Fallback publish failed: HTTP ${res.status} ${res.statusText} ${text}`);
        return;
      }

      const data = await res.json().catch(() => ({}));
      this.log.log(`Fallback publish ok: ${JSON.stringify(data)}`);
    } catch (e) {
      this.log.error('Fallback publish error', e as any);
    }
  }
}
