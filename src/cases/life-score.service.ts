import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RedisCacheService } from '../common/redis/redis-cache.service';
import { Case, CaseDocument } from './schemas/case.schema';

const LS_BONUS_VIEW     = Number(process.env.LS_BONUS_VIEW ?? 1);
const LS_BONUS_SAVE     = Number(process.env.LS_BONUS_SAVE ?? 5);
const LS_BONUS_SHARE    = Number(process.env.LS_BONUS_SHARE ?? 7);
const LS_BONUS_REFLIKE  = Number(process.env.LS_BONUS_REFLIKE ?? 3);

const DEDUP_VIEW_SEC    = Number(process.env.LS_DEDUP_VIEW_SEC ?? 21600);  
const DEDUP_SAVE_SEC    = Number(process.env.LS_DEDUP_SAVE_SEC ?? 86400);  
const DEDUP_SHARE_SEC   = Number(process.env.LS_DEDUP_SHARE_SEC ?? 86400);
const DEDUP_REFLIKE_SEC = Number(process.env.LS_DEDUP_REFLIKE_SEC ?? 86400);

const LS_MAX            = Number(process.env.LS_MAX ?? 200); 

@Injectable()
export class LifeScoreService {
  private readonly log = new Logger('LifeScoreService');

  constructor(
    private readonly cache: RedisCacheService,
    @InjectModel(Case.name) private readonly caseModel: Model<CaseDocument>,
  ) {}

  private dedupKey(kind: 'view'|'save'|'share'|'ref', caseId: string, actorId?: string, fingerprint?: string) {
    
    const who = actorId || fingerprint || 'anon';
    return `ls:dedup:${kind}:${caseId}:${who}`;
  }

  private async tryDedup(kind: 'view'|'save'|'share'|'ref', caseId: string, ttlSec: number, actorId?: string, fingerprint?: string) {
    const key = this.dedupKey(kind, caseId, actorId, fingerprint);
    const existed = await this.cache.get<string>(key);
    if (existed) return false;
    await this.cache.set(key, '1', ttlSec * 1000);
    return true;
  }

  private clampLife(value: number) {
    if (value > LS_MAX) return LS_MAX;
    if (value < 0) return 0;
    return value;
  }

  private async bumpLifeScore(caseId: string, inc: number) {
    const doc = await this.caseModel.findById(caseId).lean();
    if (!doc) return;
    const next = this.clampLife((doc.lifeScore ?? 0) + inc);
    await this.caseModel.updateOne(
      { _id: caseId, popularActive: true }, 
      { $set: { lifeScore: next } },
    );
  }

  async onView(caseId: string, opts: { actorId?: string; fingerprint?: string } = {}) {
    const ok = await this.tryDedup('view', caseId, DEDUP_VIEW_SEC, opts.actorId, opts.fingerprint);
    if (!ok) return { dedup: true };
    await Promise.all([
      this.caseModel.updateOne({ _id: caseId }, { $inc: { views: 1 } }),
      this.bumpLifeScore(caseId, LS_BONUS_VIEW),
    ]);
    return { ok: true };
  }

  async onSave(caseId: string, opts: { actorId?: string; fingerprint?: string } = {}) {
    const ok = await this.tryDedup('save', caseId, DEDUP_SAVE_SEC, opts.actorId, opts.fingerprint);
    if (!ok) return { dedup: true };
    await Promise.all([
      this.caseModel.updateOne({ _id: caseId }, { $inc: { saves: 1 } }),
      this.bumpLifeScore(caseId, LS_BONUS_SAVE),
    ]);
    return { ok: true };
  }

  async onShare(caseId: string, opts: { actorId?: string; fingerprint?: string } = {}) {
    const ok = await this.tryDedup('share', caseId, DEDUP_SHARE_SEC, opts.actorId, opts.fingerprint);
    if (!ok) return { dedup: true };
    await Promise.all([
      this.caseModel.updateOne({ _id: caseId }, { $inc: { shares: 1 } }),
      this.bumpLifeScore(caseId, LS_BONUS_SHARE),
    ]);
    return { ok: true };
  }

  async onRefLike(caseId: string, opts: { actorId?: string; fingerprint?: string } = {}) {
    const ok = await this.tryDedup('ref', caseId, DEDUP_REFLIKE_SEC, opts.actorId, opts.fingerprint);
    if (!ok) return { dedup: true };
    await Promise.all([
      this.caseModel.updateOne({ _id: caseId }, { $inc: { refsLikes: 1 } }),
      this.bumpLifeScore(caseId, LS_BONUS_REFLIKE),
    ]);
    return { ok: true };
  }
}
