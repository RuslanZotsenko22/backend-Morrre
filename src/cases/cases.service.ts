import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Case, CaseDocument } from './schemas/case.schema';
import { Model, isValidObjectId } from 'mongoose';

type CaseStatus = 'draft' | 'published';

/** Обкладинка кейса (з підтримкою різних розмірів) */
interface CoverImage {
  type: 'image';
  url: string;
  alt?: string;
  /** Дозволяємо або простий рядок-URL, або детальний об’єкт */
  sizes?: Record<
    string,
    | string
    | {
        url: string;
        width?: number;
        height?: number;
        [k: string]: unknown;
      }
  >;
}

/** Статуси життєвого циклу відео */
type VideoStatus = 'queued' | 'uploading' | 'processing' | 'ready' | 'error';

/** Метадані відео, що вже збережені у документі */
interface VideoMeta {
  vimeoId?: string; // може бути відсутній на ранніх етапах
  status: VideoStatus;
  playbackUrl?: string;
  thumbnailUrl?: string;
  [k: string]: unknown;
}

/** Пейлоад для створення нового запису у масиві videos */
type NewVideoMeta = {
  status: VideoStatus;
  vimeoId?: string; // обов'язково лише для пізніх статусів
  playbackUrl?: string;
  thumbnailUrl?: string;
  [k: string]: unknown;
};

interface CreateCaseDto {
  title: string;
  description?: string;
  status?: CaseStatus;
  tags?: string[];
  categories?: string[];
  industry?: string;
}

interface UpdateCaseDto {
  title?: string;
  description?: string;
  status?: CaseStatus;
  tags?: string[];
  categories?: string[];
  industry?: string;
  // cover/videos оновлюються окремими методами
}

// ===== helpers =====
const ALLOWED_STATUS: CaseStatus[] = ['draft', 'published'];

/** Приводить масив будь-чого до масиву рядків: trim, toLowerCase, без пустих, унікальні, зріз за лімітом */
function normalizeStringArray(
  input: unknown,
  limit: number,
  { toLower = true }: { toLower?: boolean } = { toLower: true },
): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== 'string') continue;
    let s = v.trim();
    if (!s) continue;
    if (toLower) s = s.toLowerCase();
    if (!out.includes(s)) out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

/** Перевірка валідності Mongo ObjectId */
function ensureObjectId(id: string, fieldName = 'id') {
  if (!isValidObjectId(id)) {
    throw new BadRequestException(`${fieldName} is not a valid ObjectId`);
  }
}

/** Очистка/нормалізація payload для створення кейса */
function sanitizeCreateDto(
  dto: CreateCaseDto,
): {
  title: string;
  description: string;
  status: CaseStatus;
  tags: string[];
  categories: string[];
  industry?: string; // опційне
} {
  const title = (dto.title ?? '').toString().trim();
  if (!title) throw new BadRequestException('title is required');

  const description = (dto.description ?? '').toString();
  const status = (dto.status ?? 'draft') as CaseStatus;
  if (!ALLOWED_STATUS.includes(status)) {
    throw new BadRequestException(`status must be one of: ${ALLOWED_STATUS.join(', ')}`);
  }

  const tags = normalizeStringArray(dto.tags, 20);
  const categories = normalizeStringArray(dto.categories, 3);
  const industry = dto.industry ? dto.industry.toString().trim() : undefined;

  return { title, description, status, tags, categories, industry };
}

/** Очистка/нормалізація patch для оновлення кейса */
function sanitizeUpdateDto(patch: UpdateCaseDto): UpdateCaseDto {
  const allowed: UpdateCaseDto = {};
  if (typeof patch.title === 'string') {
    const t = patch.title.trim();
    if (!t) throw new BadRequestException('title must be non-empty string');
    allowed.title = t;
  }
  if (typeof patch.description === 'string') {
    allowed.description = patch.description;
  }
  if (typeof patch.status === 'string') {
    if (!ALLOWED_STATUS.includes(patch.status as CaseStatus)) {
      throw new BadRequestException(`status must be one of: ${ALLOWED_STATUS.join(', ')}`);
    }
    allowed.status = patch.status as CaseStatus;
  }
  if (patch.tags !== undefined) {
    allowed.tags = normalizeStringArray(patch.tags, 20);
  }
  if (patch.categories !== undefined) {
    allowed.categories = normalizeStringArray(patch.categories, 3);
  }
  if (patch.industry !== undefined) {
    allowed.industry = typeof patch.industry === 'string' ? patch.industry.trim() : undefined;
  }
  return allowed;
}

@Injectable()
export class CasesService implements OnModuleInit {
  constructor(@InjectModel(Case.name) private caseModel: Model<CaseDocument>) {}

  /** при старті синхронізуємо індекси зі схеми (разово) */
  async onModuleInit() {
    try {
      await this.caseModel.syncIndexes();
    } catch {
      // не критично для run-time
    }
  }

  async create(ownerId: string, dto: CreateCaseDto) {
    if (!ownerId) throw new ForbiddenException('ownerId required');
    const clean = sanitizeCreateDto(dto);
    const doc = await this.caseModel.create({ ...clean, ownerId });
    return doc;
  }

  /** Публічний перегляд (за потреби можеш фільтрувати лише published) */
  async findPublicById(id: string) {
    ensureObjectId(id);
    const doc = await this.caseModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Case not found');
    return doc;
  }

  async updateOwned(userId: string, id: string, patch: UpdateCaseDto) {
    ensureObjectId(id);
    const doc = await this.caseModel.findById(id);
    if (!doc) throw new NotFoundException('Case not found');

    // забороняємо зміну власника
    if (String(doc.ownerId) !== String(userId)) {
      throw new ForbiddenException('Not owner');
    }

    // «білий список» полів
    const allowed = sanitizeUpdateDto(patch);
    Object.assign(doc, allowed);
    await doc.save(); // викликає валідації схеми
    return doc;
  }

  async setCover(userId: string, id: string, cover: CoverImage) {
    ensureObjectId(id);
    const doc = await this.caseModel.findById(id);
    if (!doc) throw new NotFoundException('Case not found');
    if (String(doc.ownerId) !== String(userId)) throw new ForbiddenException('Not owner');

    // базова перевірка структури cover
    if (
      !cover ||
      typeof cover !== 'object' ||
      cover.type !== 'image' ||
      typeof cover.url !== 'string' ||
      !cover.url.trim()
    ) {
      throw new BadRequestException('Invalid cover payload');
    }

    // 🔧 Нормалізація sizes: дозволяємо як { key: "url" }, так і { key: { url, ... } }
    if (cover.sizes && typeof cover.sizes === 'object') {
      const normalized: NonNullable<CoverImage['sizes']> = {};
      for (const [key, val] of Object.entries(cover.sizes)) {
        if (typeof val === 'string') {
          if (!val.trim()) continue;
          normalized[key] = { url: val.trim() };
        } else if (
          val &&
          typeof val === 'object' &&
          typeof (val as any).url === 'string' &&
          (val as any).url.trim()
        ) {
          normalized[key] = { ...(val as any), url: (val as any).url.trim() };
        } else {
          // пропускаємо невалідні елементи
          continue;
        }
      }
      cover = { ...cover, sizes: normalized };
    }

    doc.cover = cover;
    await doc.save();
    return doc;
  }

  /**
   * Додаємо новий запис у масив videos.
   * Для статусів 'processing' | 'ready' — вимагаємо наявність vimeoId.
   * Для 'queued' | 'uploading' — vimeoId може бути відсутній.
   */
  async pushVideoMeta(caseId: string, meta: NewVideoMeta) {
    ensureObjectId(caseId, 'caseId');

    if (!meta || typeof meta !== 'object') {
      throw new BadRequestException('Invalid video meta');
    }
    if (!meta.status) {
      throw new BadRequestException('meta.status is required');
    }
    const needsVimeoId = meta.status === 'processing' || meta.status === 'ready';
    if (needsVimeoId && (!meta.vimeoId || !meta.vimeoId.trim())) {
      throw new BadRequestException('meta.vimeoId is required for this status');
    }

    return this.caseModel.findByIdAndUpdate(
      caseId,
      { $push: { videos: meta as VideoMeta } },
      { new: true, runValidators: true },
    );
  }

  async updateVideoStatus(caseId: string, vimeoId: string, patch: Partial<VideoMeta>) {
    ensureObjectId(caseId, 'caseId');
    if (!vimeoId) throw new BadRequestException('vimeoId required');
    if (!patch || typeof patch !== 'object') {
      throw new BadRequestException('Invalid patch');
    }

    const $set: Record<string, unknown> = {};
    if (patch.status) $set['videos.$.status'] = patch.status;
    if (patch.playbackUrl) $set['videos.$.playbackUrl'] = patch.playbackUrl;
    if (patch.thumbnailUrl) $set['videos.$.thumbnailUrl'] = patch.thumbnailUrl;

    if (Object.keys($set).length === 0) {
      throw new BadRequestException('Nothing to update');
    }

    return this.caseModel.updateOne(
      { _id: caseId, 'videos.vimeoId': vimeoId },
      { $set },
      { runValidators: true },
    );
  }

  //  NEW: оновлення відео за vimeoId без знання caseId (для вебхука)
  async updateVideoStatusByVimeoId(
    vimeoId: string,
    patch: { status: VideoStatus | string; playbackUrl?: string; thumbnailUrl?: string },
  ) {
    if (!vimeoId || !vimeoId.trim()) {
      throw new BadRequestException('vimeoId required');
    }
    const $set: Record<string, unknown> = {};
    if (patch.status) $set['videos.$.status'] = patch.status;
    if (patch.playbackUrl) $set['videos.$.playbackUrl'] = patch.playbackUrl;
    if (patch.thumbnailUrl) $set['videos.$.thumbnailUrl'] = patch.thumbnailUrl;

 $set['videos.$.vimeoId'] = vimeoId;

    if (Object.keys($set).length === 0) {
      throw new BadRequestException('Nothing to update');
    }

    return this.caseModel.updateOne(
      { 'videos.vimeoId': vimeoId },
      { $set },
      { runValidators: true },
    );
  }

  // === sync helpers (викликаються воркером) ===

  /**
   * Синх із тієї ж Mongo (найпростіше і без авторизації).
   * Підтягуємо актуальний документ і виконуємо бізнес-дії
   * (оновлення індексів/кешів/обчислюваних полів тощо).
   */
  public async syncFromMongo(id: string): Promise<void> {
    ensureObjectId(id);
    const doc = await this.caseModel.findById(id).lean();
    if (!doc) {
      return; // кейс видалено або id некоректний — просто виходимо
    }

    // приклад мінімальної нормалізації/патчу
    const patch: Partial<UpdateCaseDto> = {};
    const tags = normalizeStringArray((doc as any).tags, 20);
    const categories = normalizeStringArray((doc as any).categories, 3);
    if (JSON.stringify(tags) !== JSON.stringify((doc as any).tags)) patch.tags = tags;
    if (JSON.stringify(categories) !== JSON.stringify((doc as any).categories)) patch.categories = categories;

    if (Object.keys(patch).length) {
      await this.caseModel.updateOne(
        { _id: id },
        { $set: sanitizeUpdateDto(patch) },
        { runValidators: true },
      );
    }
  }

  /**
   * Синх із документа, отриманого через Payload REST (із depth/relations).
   * Використовуй, якщо у воркері тягнеш doc через HTTP (варіант B).
   */
  public async syncFromPayload(doc: any): Promise<void> {
    if (!doc || !doc.id) return;

    const patch: UpdateCaseDto = {
      title: typeof doc.title === 'string' ? doc.title : undefined,
      description: typeof doc.description === 'string' ? doc.description : undefined,
      status: (doc.status === 'draft' || doc.status === 'published') ? doc.status : undefined,
      industry: typeof doc.industry === 'string' ? doc.industry : undefined,
      // у твоїй Payload-колекції tags/categories — масив об'єктів { value }
      tags: Array.isArray(doc.tags)
        ? doc.tags.map((t: any) => (typeof t?.value === 'string' ? t.value : null)).filter(Boolean)
        : undefined,
      categories: Array.isArray(doc.categories)
        ? doc.categories.map((c: any) => (typeof c?.value === 'string' ? c.value : null)).filter(Boolean)
        : undefined,
    };

    const clean = sanitizeUpdateDto(patch);
    const $set: Record<string, unknown> = { ...clean };

    if (doc.cover && typeof doc.cover === 'object') {
      $set['cover'] = {
        type: 'image',
        url: doc.cover?.url ?? '',
        alt: doc.cover?.alt,
        sizes: doc.cover?.sizes ?? undefined,
      };
    }

    if (Array.isArray(doc.videos)) {
      // очікуємо поля { provider, externalId, status, url }
      $set['videos'] = doc.videos.map((v: any) => ({
        vimeoId: typeof v?.externalId === 'string' ? v.externalId : undefined,
        status: typeof v?.status === 'string' ? v.status : 'queued',
        playbackUrl: typeof v?.url === 'string' ? v.url : undefined,
      })) as any[];
    }

    await this.caseModel.updateOne(
      { _id: doc.id },
      { $set },
      { runValidators: true },
    );
  }

  
}
