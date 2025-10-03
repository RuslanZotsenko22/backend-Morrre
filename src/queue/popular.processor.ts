import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import type IORedis from 'ioredis';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { QUEUE_TOKENS } from './bullmq.provider';
import { Case, CaseDocument } from '../cases/schemas/case.schema';

const DAILY_COUNT = parseInt(process.env.POPULAR_DAILY_COUNT || '8', 10) || 8;
const INITIAL_LIFE = parseInt(process.env.POPULAR_LIFE_INITIAL || '100', 10) || 100;
const DECAY_STEP   = parseInt(process.env.POPULAR_LIFE_DECAY || '5', 10) || 5;

@Injectable()
export class PopularProcessor implements OnModuleInit {
  private readonly log = new Logger('PopularProcessor');

  constructor(
    @Inject(QUEUE_TOKENS.REDIS) private readonly connection: IORedis,
    @InjectModel(Case.name) private readonly caseModel: Model<CaseDocument>,
  ) {}

  onModuleInit() {
    // окрема воркер-нитка на чергу popular-jobs
    new Worker(
      'popular-jobs',
      async (job) => {
        if (job.name === 'daily-publish') {
          await this.handleDailyPublish();
        } else if (job.name === 'hourly-decay') {
          await this.handleHourlyDecay();
        }
      },
      { connection: this.connection as any },
    );
  }

  private async handleDailyPublish() {
    // 1) Забираємо спочатку forceToday
    const force = await this.caseModel
      .find({
        status: 'published',
        curatedQueued: true,
        forceToday: true,
      })
      .sort({ curatedAddedAt: 1 })
      .limit(DAILY_COUNT)
      .lean();

    const remain = DAILY_COUNT - force.length;

    // 2) Потім звичайну чергу FIFO
    const queued =
      remain > 0
        ? await this.caseModel
            .find({
              status: 'published',
              curatedQueued: true,
              forceToday: { $ne: true },
            })
            .sort({ curatedAddedAt: 1 })
            .limit(remain)
            .lean()
        : [];

    const batch = [...force, ...queued];
    if (!batch.length) {
      this.log.log('daily-publish: nothing to publish');
      return;
    }

    const now = new Date();
    const batchDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 3) Помічаємо як популярні (активуємо), знімаємо з черги
    const ops = batch.map((doc) =>
      this.caseModel.updateOne(
        { _id: doc._id },
        {
          $set: {
            curatedQueued: false,
            forceToday: false,
            popularActive: true,
            popularPublishedAt: now,
            popularBatchDate: batchDate,
            lifeScore: INITIAL_LIFE,
          },
        },
        { runValidators: true },
      ),
    );

    await Promise.all(ops);

    this.log.log(`daily-publish: published ${batch.length} cases`);
  }

  private async handleHourlyDecay() {
    // 1) Понижуємо lifeScore активним
    const res = await this.caseModel.updateMany(
      { popularActive: true, lifeScore: { $gt: 0 } },
      { $inc: { lifeScore: -DECAY_STEP } },
    );
    this.log.debug(`hourly-decay: decayed ${res.modifiedCount} cases`);

    // 2) Вимикаємо ті, що "померли"
    const res2 = await this.caseModel.updateMany(
      { popularActive: true, lifeScore: { $lte: 0 } },
      { $set: { popularActive: false } },
    );

    if ((res2 as any).modifiedCount) {
      this.log.log(`hourly-decay: deactivated ${(res2 as any).modifiedCount} cases`);
    }
  }
}
