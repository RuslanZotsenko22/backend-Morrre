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
  }


}
