import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Queue } from 'bullmq';
import { USER_STATS_QUEUE } from './user-stats.queue';

@Injectable()
export class UserStatsHooksService implements OnModuleInit {
  private readonly log = new Logger('UserStatsHooks');

  constructor(
    @InjectConnection() private readonly conn: Connection,
    @Inject(USER_STATS_QUEUE) private readonly userStatsQueue: Queue,
  ) {}

  onModuleInit() {
    // Моделі
    const Case: Model<any> = this.conn.model('Case');
    const CaseVote: Model<any> = this.conn.model('CaseVote', undefined, 'casevotes'); // якщо інша колекція — підправ
    const Follow: Model<any> = this.conn.model('Follow');

    // ——— CASE hooks ———
    const enqueueForCase = async (caseDoc: any | null) => {
      if (!caseDoc) return;
      const userIds = new Set<string>();
      if (caseDoc.authorId) userIds.add(String(caseDoc.authorId));
      for (const u of caseDoc.contributors || []) userIds.add(String(u));
      await Promise.all(
        Array.from(userIds).map((id) =>
          this.userStatsQueue.add(
            'recount',
            { userId: id },
            { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
          ),
        ),
      );
    };

    // save (create/update via doc.save)
    Case.schema.post('save', async function (doc: any) {
      try { await enqueueForCase(doc); } catch (e) { /* ignore */ }
    });

    // findOneAndUpdate → отримуємо оновлений doc (якщо new:true). Якщо ні — дочитуємо.
    Case.schema.post('findOneAndUpdate', async function (res: any) {
      try {
        if (res) return enqueueForCase(res);
        const id = (this as any).getFilter()?._id;
        if (id) {
          const doc = await Case.findById(id).lean();
          await enqueueForCase(doc);
        }
      } catch (e) { /* ignore */ }
    });

    // findOneAndDelete (маємо doc у res у сучасному mongoose)
    Case.schema.post('findOneAndDelete', async function (res: any) {
      try { await enqueueForCase(res); } catch (e) { /* ignore */ }
    });

    // updateOne/updateMany – тут res = writeResult, тож дочитаємо за фільтром (обережно: може бути багато)
    Case.schema.post('updateOne', async function () {
      try {
        const filter = (this as any).getFilter() || {};
        // обмежимося лише випадком одиничного id
        const id = filter._id as Types.ObjectId | string | undefined;
        if (id) {
          const doc = await Case.findById(id).lean();
          await enqueueForCase(doc);
        }
      } catch (e) { /* ignore */ }
    });

    // ——— CASE VOTE hooks ———
    const enqueueByCaseId = async (caseId: any) => {
      if (!caseId) return;
      const doc = await Case.findById(caseId).lean();
      await enqueueForCase(doc);
    };

    CaseVote.schema.post('save', async function (doc: any) {
      try { await enqueueByCaseId(doc.caseId); } catch (e) { /* ignore */ }
    });
    CaseVote.schema.post('findOneAndDelete', async function (res: any) {
      try { await enqueueByCaseId(res?.caseId); } catch (e) { /* ignore */ }
    });
    CaseVote.schema.post('deleteOne', async function () {
      try {
        const filter = (this as any).getFilter() || {};
        await enqueueByCaseId(filter.caseId);
      } catch (e) { /* ignore */ }
    });

    // ——— FOLLOW hooks ———
    const enqueueTarget = async (targetId: any) => {
      if (!targetId) return;
      await this.userStatsQueue.add(
        'recount',
        { userId: String(targetId) },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      );
    };

    Follow.schema.post('save', async function (doc: any) {
      try { await enqueueTarget(doc.targetId); } catch (e) { /* ignore */ }
    });
    Follow.schema.post('findOneAndDelete', async function (res: any) {
      try { await enqueueTarget(res?.targetId); } catch (e) { /* ignore */ }
    });
    Follow.schema.post('deleteOne', async function () {
      try {
        const filter = (this as any).getFilter() || {};
        await enqueueTarget(filter.targetId);
      } catch (e) { /* ignore */ }
    });

    this.log.log('hooks attached: Case, CaseVote, Follow');
  }
}
