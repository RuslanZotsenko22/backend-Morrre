import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Case, CaseDocument } from './schemas/case.schema'
import { Model, isValidObjectId } from 'mongoose'
import { RedisCacheService } from '../common/redis/redis-cache.service'
import { Collection, CollectionDocument } from '../collections/schemas/collection.schema';
import { PaletteService } from './palette/palette.service'
import { INDUSTRY_ENUM, WHAT_DONE_ENUM } from './schemas/case.schema'
type CaseStatus = 'draft' | 'published'

/** Обкладинка кейса (з підтримкою різних розмірів) */
interface CoverImage {
  type: 'image'
  url: string
  alt?: string
  /** Дозволяємо або простий рядок-URL, або детальний об’єкт */
  sizes?: Record<
    string,
    | string
    | {
        url: string
        width?: number
        height?: number
        [k: string]: unknown
      }
  >
}

/** Статуси життєвого циклу відео */
type VideoStatus = 'queued' | 'uploading' | 'processing' | 'ready' | 'error'

/** Метадані відео, що вже збережені у документі */
interface VideoMeta {
  vimeoId?: string // може бути відсутній на ранніх етапах
  status: VideoStatus
  playbackUrl?: string
  thumbnailUrl?: string
  [k: string]: unknown
}

/** Пейлоад для створення нового запису у масиві videos */
type NewVideoMeta = {
  status: VideoStatus
  vimeoId?: string // обов'язково лише для пізніх статусів
  playbackUrl?: string
  thumbnailUrl?: string
  [k: string]: unknown
}

interface CreateCaseDto {
  title: string
  description?: string
  status?: CaseStatus
  tags?: string[]
  categories?: string[]
  industry?: string
}

interface UpdateCaseDto {
  title?: string
  description?: string
  status?: CaseStatus
  tags?: string[]
  categories?: string[]
  industry?: string
  // cover/videos оновлюються окремими методами
}

// ===== helpers =====
const ALLOWED_STATUS: CaseStatus[] = ['draft', 'published']

/** Приводить масив будь-чого до масиву рядків: trim, toLowerCase, без пустих, унікальні, зріз за лімітом */
function normalizeStringArray(
  input: unknown,
  limit: number,
  { toLower = true }: { toLower?: boolean } = { toLower: true },
): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const v of input) {
    if (typeof v !== 'string') continue
    let s = v.trim()
    if (!s) continue
    if (toLower) s = s.toLowerCase()
    if (!out.includes(s)) out.push(s)
    if (out.length >= limit) break
  }
  return out
}

/** Перевірка валідності Mongo ObjectId */
function ensureObjectId(id: string, fieldName = 'id') {
  if (!isValidObjectId(id)) {
    throw new BadRequestException(`${fieldName} is not a valid ObjectId`)
  }
}

/** Очистка/нормалізація payload для створення кейса */
function sanitizeCreateDto(
  dto: CreateCaseDto,
): {
  title: string
  description: string
  status: CaseStatus
  tags: string[]
  categories: string[]
  industry?: string
  whatWasDone?: string[] // ✅ додаємо це поле
} {
  const title = (dto.title ?? '').toString().trim()
  if (!title) throw new BadRequestException('title is required')

  const description = (dto.description ?? '').toString()
  const status = (dto.status ?? 'draft') as CaseStatus
  if (!ALLOWED_STATUS.includes(status)) {
    throw new BadRequestException(`status must be one of: ${ALLOWED_STATUS.join(', ')}`)
  }

  const tags = normalizeStringArray(dto.tags, 20)
  const categories = normalizeStringArray(dto.categories, 3)

  // ✅ industry — перевірка по ENUM
  const industry =
    dto.industry && INDUSTRY_ENUM.includes(dto.industry as any)
      ? (dto.industry as any)
      : undefined

  // ✅ whatWasDone — опційне поле, фільтруємо по ENUM
  const whatWasDone = Array.isArray((dto as any).whatWasDone)
    ? (dto as any).whatWasDone.filter((v: any) => WHAT_DONE_ENUM.includes(v)).slice(0, 12)
    : []

  return { title, description, status, tags, categories, industry, whatWasDone }
}



/** Очистка/нормалізація patch для оновлення кейса */
function sanitizeUpdateDto(patch: UpdateCaseDto): UpdateCaseDto {
  const allowed: UpdateCaseDto = {}

  if (typeof patch.title === 'string') {
    const t = patch.title.trim()
    if (!t) throw new BadRequestException('title must be non-empty string')
    allowed.title = t
  }

  if (typeof patch.description === 'string') {
    allowed.description = patch.description
  }

  if (typeof patch.status === 'string') {
    if (!ALLOWED_STATUS.includes(patch.status as CaseStatus)) {
      throw new BadRequestException(`status must be one of: ${ALLOWED_STATUS.join(', ')}`)
    }
    allowed.status = patch.status as CaseStatus
  }

  if (patch.tags !== undefined) {
    allowed.tags = normalizeStringArray(patch.tags, 20)
  }

  if (patch.categories !== undefined) {
    allowed.categories = normalizeStringArray(patch.categories, 3)
  }

  // ✅ whatWasDone — перевіряємо, якщо є
  if ((patch as any).whatWasDone !== undefined) {
    (allowed as any).whatWasDone = Array.isArray((patch as any).whatWasDone)
      ? (patch as any).whatWasDone.filter((v: any) => WHAT_DONE_ENUM.includes(v)).slice(0, 12)
      : []
  }

  // ✅ industry — перевірка по ENUM
  if (patch.industry !== undefined) {
    allowed.industry = INDUSTRY_ENUM.includes(patch.industry as any)
      ? (patch.industry as any)
      : undefined
  }

  return allowed
}



@Injectable()
export class CasesService implements OnModuleInit {
  private readonly ttlMs = 300_000 // 5 хв
  private readonly prefix = 'cases:' // префікс ключів у Redis

constructor(
  @InjectModel(Case.name) private caseModel: Model<CaseDocument>,
  @InjectModel(Collection.name) private collectionModel: Model<CollectionDocument>,
  private readonly cache: RedisCacheService,
  private readonly palette: PaletteService, 
) {}


  // ── Cache key helpers ──────────────────────────────────────────────────────
  private kById(id: string) {
    return `${this.prefix}id:${id}`
  }
  private kPopularSlides(limit: number) {
    return `${this.prefix}popularSlides:${limit}`
  }
  private kDiscover(category: string | undefined | null, limit: number) {
    const cat = (category || 'all').toLowerCase()
    return `${this.prefix}discover:cat:${cat}:l:${limit}`
  }
  private kDiscoverBatch(batchISO: string, category: string | undefined | null, limit: number) {
    const cat = (category || 'all').toLowerCase()
    return `${this.prefix}discoverBatch:${batchISO}:cat:${cat}:l:${limit}`
  }

  /** при старті синхронізуємо індекси зі схеми (разово) */
  async onModuleInit() {
    try {
      await this.caseModel.syncIndexes()
    } catch {
      // не критично для run-time
    }
  }

  // ── MUTATIONS (стирають кеш) ───────────────────────────────────────────────
  private async invalidateAll() {
    await this.cache.del(this.prefix) // знести все, що під cases:
  }
  private async invalidateById(id: string) {
    await this.cache.del(this.kById(id))
  }

  async create(ownerId: string, dto: CreateCaseDto) {
    if (!ownerId) throw new ForbiddenException('ownerId required')
    const clean = sanitizeCreateDto(dto)
    const doc = await this.caseModel.create({ ...clean, ownerId })
    await this.invalidateAll()
    return doc
  }

  /** Публічний перегляд (за потреби можеш фільтрувати лише published) */
  async findPublicById(id: string) {
    ensureObjectId(id)
    const key = this.kById(id)
    const hit = await this.cache.get<any>(key)
    if (hit) return hit

    const doc = await this.caseModel.findById(id).lean()
    if (!doc) throw new NotFoundException('Case not found')

    await this.cache.set(key, doc, this.ttlMs)
    return doc
  }

  async updateOwned(userId: string, id: string, patch: UpdateCaseDto) {
    ensureObjectId(id)
    const doc = await this.caseModel.findById(id)
    if (!doc) throw new NotFoundException('Case not found')

    // забороняємо зміну власника
    if (String(doc.ownerId) !== String(userId)) {
      throw new ForbiddenException('Not owner')
    }

    // «білий список» полів
    const allowed = sanitizeUpdateDto(patch)
    Object.assign(doc, allowed)
    await doc.save() // викликає валідації схеми

    await this.invalidateAll()
    await this.invalidateById(id)

    return doc
  }

  async setCover(userId: string, id: string, cover: CoverImage) {
    ensureObjectId(id)
    const doc = await this.caseModel.findById(id)
    if (!doc) throw new NotFoundException('Case not found')
    if (String(doc.ownerId) !== String(userId)) throw new ForbiddenException('Not owner')

    // базова перевірка структури cover
    if (
      !cover ||
      typeof cover !== 'object' ||
      cover.type !== 'image' ||
      typeof cover.url !== 'string' ||
      !cover.url.trim()
    ) {
      throw new BadRequestException('Invalid cover payload')
    }

    // 🔧 Нормалізація sizes: дозволяємо як { key: "url" }, так і { key: { url, ... } }
    if (cover.sizes && typeof cover.sizes === 'object') {
      const normalized: NonNullable<CoverImage['sizes']> = {}
      for (const [key, val] of Object.entries(cover.sizes)) {
        if (typeof val === 'string') {
          if (!val.trim()) continue
          normalized[key] = { url: val.trim() }
        } else if (
          val &&
          typeof val === 'object' &&
          typeof (val as any).url === 'string' &&
          (val as any).url.trim()
        ) {
          normalized[key] = { ...(val as any), url: (val as any).url.trim() }
        } else {
          continue
        }
      }
      cover = { ...cover, sizes: normalized }
    }

    doc.cover = cover
    await doc.save()

    await this.invalidateAll()
    await this.invalidateById(id)

    return doc
  }

  /**
   * Додаємо новий запис у масив videos.
   * Для статусів 'processing' | 'ready' — вимагаємо наявність vimeoId.
   * Для 'queued' | 'uploading' — vimeoId може бути відсутній.
   */
  async pushVideoMeta(caseId: string, meta: NewVideoMeta) {
    ensureObjectId(caseId, 'caseId')

    if (!meta || typeof meta !== 'object') {
      throw new BadRequestException('Invalid video meta')
    }
    if (!meta.status) {
      throw new BadRequestException('meta.status is required')
    }
    const needsVimeoId = meta.status === 'processing' || meta.status === 'ready'
    if (needsVimeoId && (!meta.vimeoId || !meta.vimeoId.trim())) {
      throw new BadRequestException('meta.vimeoId is required for this status')
    }

    const updated = await this.caseModel.findByIdAndUpdate(
      caseId,
      { $push: { videos: meta as VideoMeta } },
      { new: true, runValidators: true },
    )

    await this.invalidateAll()
    await this.invalidateById(caseId)

    return updated
  }

  async updateVideoStatus(caseId: string, vimeoId: string, patch: Partial<VideoMeta>) {
    ensureObjectId(caseId, 'caseId')
    if (!vimeoId) throw new BadRequestException('vimeoId required')
    if (!patch || typeof patch !== 'object') {
      throw new BadRequestException('Invalid patch')
    }

    const $set: Record<string, unknown> = {}
    if (patch.status) $set['videos.$.status'] = patch.status
    if (patch.playbackUrl) $set['videos.$.playbackUrl'] = patch.playbackUrl
    if (patch.thumbnailUrl) $set['videos.$.thumbnailUrl'] = patch.thumbnailUrl

    if (Object.keys($set).length === 0) {
      throw new BadRequestException('Nothing to update')
    }

    const res = await this.caseModel.updateOne(
      { _id: caseId, 'videos.vimeoId': vimeoId },
      { $set },
      { runValidators: true },
    )

    await this.invalidateAll()
    await this.invalidateById(caseId)

    return res
  }

  //  NEW: оновлення відео за vimeoId без знання caseId (для вебхука)
  async updateVideoStatusByVimeoId(
    vimeoId: string,
    patch: { status: VideoStatus | string; playbackUrl?: string; thumbnailUrl?: string },
  ) {
    if (!vimeoId || !vimeoId.trim()) {
      throw new BadRequestException('vimeoId required')
    }
    const $set: Record<string, unknown> = {}
    if (patch.status) $set['videos.$.status'] = patch.status
    if (patch.playbackUrl) $set['videos.$.playbackUrl'] = patch.playbackUrl
    if (patch.thumbnailUrl) $set['videos.$.thumbnailUrl'] = patch.thumbnailUrl

    $set['videos.$.vimeoId'] = vimeoId

    if (Object.keys($set).length === 0) {
      throw new BadRequestException('Nothing to update')
    }

    const res = await this.caseModel.updateOne(
      { 'videos.vimeoId': vimeoId },
      { $set },
      { runValidators: true },
    )

    await this.invalidateAll()

    return res
  }

  // === sync helpers (викликаються воркером) ===

  /** Синх із тієї ж Mongo (м’яко, без шуму) */
  public async syncFromMongo(id: string): Promise<void> {
    if (!isValidObjectId(id)) return

    const doc = await this.caseModel.findById(id).lean()
    if (!doc) return

    const patch: Record<string, unknown> = {}

    // 1) tags / categories → масиви рядків, lower, унікальні, ліміти
    const normTags = normalizeStringArray((doc as any).tags, 20)
    const normCats = normalizeStringArray((doc as any).categories, 3)
    if (JSON.stringify(normTags) !== JSON.stringify((doc as any).tags)) {
      patch['tags'] = normTags
    }
    if (JSON.stringify(normCats) !== JSON.stringify((doc as any).categories)) {
      patch['categories'] = normCats
    }

    // 2) videos → фільтр статусів + дедуп за vimeoId
    const ALLOWED_VIDEO: VideoStatus[] = ['queued', 'uploading', 'processing', 'ready', 'error']
    if (Array.isArray((doc as any).videos)) {
      const seen = new Set<string>()
      const videos: any[] = []
      for (const v of (doc as any).videos) {
        if (!v || typeof v !== 'object') continue
        const status: VideoStatus = ALLOWED_VIDEO.includes(v.status) ? v.status : 'queued'
        const vimeoId = typeof v.vimeoId === 'string' ? v.vimeoId.trim() : undefined

        const key = vimeoId ?? `__idx_${videos.length}`
        if (seen.has(key)) continue
        seen.add(key)

        videos.push({
          ...v,
          status,
          ...(vimeoId ? { vimeoId } : {}),
        })
      }
      if (JSON.stringify(videos) !== JSON.stringify((doc as any).videos)) {
        patch['videos'] = videos
      }
    }

    // 3) cover.sizes: "url" → { url }
    if (doc.cover?.sizes && typeof doc.cover.sizes === 'object') {
      const sizes = doc.cover.sizes as Record<string, any>
      const norm: Record<string, any> = {}
      let changed = false
      for (const [k, v] of Object.entries(sizes)) {
        if (typeof v === 'string') {
          const u = v.trim()
          if (!u) continue
          norm[k] = { url: u }
          changed = true
        } else if (v && typeof v === 'object' && typeof (v as any).url === 'string') {
          const u = (v as any).url.trim()
          if (!u) continue
          norm[k] = { ...(v as any), url: u }
        }
      }
      if (changed) patch['cover.sizes'] = norm
    }

    if (Object.keys(patch).length > 0) {
      await this.caseModel.updateOne({ _id: id }, { $set: patch }, { runValidators: true })
      await this.invalidateAll()
      await this.invalidateById(id)
    }
  }

  /** витягнути список URL зображень з кейса (cover + blocks.media:image) */
private collectImageUrlsFromCase(caseDoc: any): string[] {
  const urls: string[] = []
  // cover
  const coverUrl = caseDoc?.cover?.url
  if (typeof coverUrl === 'string' && coverUrl.trim()) urls.push(coverUrl.trim())
  const sizes = caseDoc?.cover?.sizes
  if (sizes && typeof sizes === 'object') {
    for (const v of Object.values(sizes)) {
      const u = typeof v === 'string' ? v : (v as any)?.url
      if (typeof u === 'string' && u.trim()) urls.push(u.trim())
    }
  }
  // blocks
  const blocks = Array.isArray(caseDoc?.blocks) ? caseDoc.blocks : []
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue
    if (b.kind === 'media' && Array.isArray(b.media)) {
      for (const m of b.media) {
        if (m?.type === 'image' && typeof m?.url === 'string' && m.url.trim()) {
          urls.push(m.url.trim())
        }
      }
    }
  }
  return urls
}


  /** Синх із документа, отриманого через Payload REST (із depth/relations) */
  public async syncFromPayload(doc: any): Promise<void> {
    if (!doc || !doc.id) return

    const patch: UpdateCaseDto = {
      title: typeof doc.title === 'string' ? doc.title : undefined,
      description: typeof doc.description === 'string' ? doc.description : undefined,
      status: (doc.status === 'draft' || doc.status === 'published') ? doc.status : undefined,
      industry: typeof doc.industry === 'string' ? doc.industry : undefined,
      tags: Array.isArray(doc.tags)
        ? doc.tags.map((t: any) => (typeof t?.value === 'string' ? t.value : null)).filter(Boolean)
        : undefined,
      categories: Array.isArray(doc.categories)
        ? doc.categories.map((c: any) => (typeof c?.value === 'string' ? c.value : null)).filter(Boolean)
        : undefined,
    }

    const clean = sanitizeUpdateDto(patch)
    const $set: Record<string, unknown> = { ...clean }

    if (doc.cover && typeof doc.cover === 'object') {
      $set['cover'] = {
        type: 'image',
        url: doc.cover?.url ?? '',
        alt: doc.cover?.alt,
        sizes: doc.cover?.sizes ?? undefined,
      }
    }

    if (Array.isArray(doc.videos)) {
      $set['videos'] = doc.videos.map((v: any) => ({
        vimeoId: typeof v?.externalId === 'string' ? v.externalId : undefined,
        status: typeof v?.status === 'string' ? v.status : 'queued',
        playbackUrl: typeof v?.url === 'string' ? v.url : undefined,
      })) as any[]
    }

    await this.caseModel.updateOne(
      { _id: doc.id },
      { $set },
      { runValidators: true },
    )

    await this.invalidateAll()
    await this.invalidateById(doc.id)
  }

  /** =======================
   *    ГОЛОВНА / POPULAR
   *  ======================= */

  /** Popular today (слайди) — у CMS виставляємо featuredSlides=true */
  public async findPopularSlides(limit = 6) {
    // ця ф-ція використовується у getPopularSlides — без кешу тут
    return this.caseModel
      .find({ status: 'published', featuredSlides: true })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean()
  }

  /** Discover — повертає останній батч популярних (опційно фільтр за категорією)
   *  Сортування в батчі: lifeScore ↓, popularPublishedAt ↓
   */
  public async findDiscoverBatch(params: { category?: string; limit: number }) {
    const { category, limit } = params

    const latest = await this.caseModel
      .findOne({ popularActive: true, popularBatchDate: { $ne: null } })
      .sort({ popularBatchDate: -1 })
      .select({ popularBatchDate: 1 })
      .lean()

    const batchDate = (latest as any)?.popularBatchDate
    if (!batchDate) return []

    const q: any = { popularActive: true, popularBatchDate: batchDate }
    if (category) q.categories = { $in: [category.toLowerCase()] }

    return this.caseModel
      .find(q)
      .sort({ lifeScore: -1, popularPublishedAt: -1, _id: 1 })
      .limit(limit)
      .select({
        title: 1,
        industry: 1,
        categories: 1,
        cover: 1,
        videos: 1,
        lifeScore: 1,
        popularPublishedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .lean()
  }

  /** /api/cases/popular-slides (з кешем) */
  public async getPopularSlides(limit = 6) {
    const n = Math.max(3, Math.min(6, Number(limit) || 6))
    const key = this.kPopularSlides(n)
    const hit = await this.cache.get<any>(key)
    if (hit) return hit

    // якщо у тебе є featuredSlides — використовуємо його
    const docs = await this.caseModel
      .find({ status: 'published', featuredSlides: true })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(n)
      .select({
        title: 1,
        industry: 1,
        categories: 1,
        cover: 1,
        videos: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .lean()

    let data = docs
    // fallback: якщо немає позначених — просто свіжі опубліковані
    if (docs.length < 3) {
      data = await this.caseModel
        .find({ status: 'published' })
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(n)
        .select({
          title: 1,
          industry: 1,
          categories: 1,
          cover: 1,
          videos: 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .lean()
    }

    await this.cache.set(key, data, this.ttlMs)
    return data
  }

  /** /api/cases/discover?category=&limit=  (з кешем і з урахуванням батча) */
  public async discoverCases(opts: { category?: string; limit?: number }) {
    const n = Math.max(1, Math.min(100, Number(opts?.limit) || 12))
    const cat = opts?.category?.toLowerCase()
    const key = this.kDiscover(cat, n)

    const hit = await this.cache.get<any>(key)
    if (hit) return hit

    // якщо вже є батч popular — віддаємо його (кешуємо окремо)
    const latest = await this.caseModel
      .findOne({ popularActive: true, popularBatchDate: { $ne: null } })
      .sort({ popularBatchDate: -1 })
      .select({ popularBatchDate: 1 })
      .lean()

    const batchDate = (latest as any)?.popularBatchDate as Date | undefined
    if (batchDate) {
      const batchKey = this.kDiscoverBatch(batchDate.toISOString(), cat, n)
      const batchHit = await this.cache.get<any>(batchKey)
      if (batchHit) {
        await this.cache.set(key, batchHit, this.ttlMs) // також покладемо у загальний discover-кеш
        return batchHit
      }

      const q: any = { popularActive: true, popularBatchDate: batchDate }
      if (cat) q.categories = { $in: [cat] }

      const data = await this.caseModel
        .find(q)
        .sort({ lifeScore: -1, popularPublishedAt: -1, _id: 1 })
        .limit(n)
        .select({
          title: 1,
          industry: 1,
          categories: 1,
          cover: 1,
          videos: 1,
          lifeScore: 1,
          popularPublishedAt: 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .lean()

      await this.cache.set(batchKey, data, this.ttlMs)
      await this.cache.set(key, data, this.ttlMs)
      return data
    }

    // fallback: просто опубліковані (опційно фільтр за категорією)
    const q: any = { status: 'published' }
    if (cat) q.categories = { $in: [cat] }

    const data = await this.caseModel
      .find(q)
      .sort({ lifeScore: -1, updatedAt: -1, _id: 1 })
      .limit(n)
      .select({
        title: 1,
        industry: 1,
        categories: 1,
        cover: 1,
        videos: 1,
        lifeScore: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .lean()

    await this.cache.set(key, data, this.ttlMs)
    return data
  }

  /** Позначити кейс для curated-черги (адмінська дія) — твоя поточна логіка */
  public async addToCuratedQueue(params: { id: string; forceToday?: boolean }) {
    const { id, forceToday } = params
    ensureObjectId(id)
    const patch: Record<string, unknown> = {
      popularQueued: true,
      queuedAt: new Date(),
    }
    if (forceToday !== undefined) patch['forceToday'] = !!forceToday

    const doc = await this.caseModel
      .findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true })
      .lean()

    if (!doc) throw new NotFoundException('Case not found')

    await this.invalidateAll()
    await this.invalidateById(id)

    return { ok: true }
  }

  /**
   * Сумісний метод під InternalController: markCuratedQueued(id, queued, forceToday?)
   * Ставить/знімає одночасно:
   *  - popularQueued/queuedAt
   *  - curatedQueued/curatedQueuedAt
   *  і прибирає популярні мітки, якщо повертаємо до черги.
   */
  public async markCuratedQueued(
    id: string,
    queued = true,
    forceToday = false,
  ): Promise<void> {
    ensureObjectId(id)

    if (queued) {
      const now = new Date()
      await this.caseModel.updateOne(
        { _id: id },
        {
          $set: {
            popularQueued: true,
            queuedAt: now,
            curatedQueued: true,
            curatedQueuedAt: now,
            ...(forceToday ? { forceToday: true } : {}),
          },
          // прибираємо активні popular-прапорці, якщо кейс повернули у чергу
          $unset: { popularActive: '', popularBatchDate: '', popularPublishedAt: '' },
        },
        { runValidators: true },
      )
    } else {
      await this.caseModel.updateOne(
        { _id: id },
        {
          $unset: {
            popularQueued: '',
            queuedAt: '',
            curatedQueued: '',
            curatedQueuedAt: '',
            forceToday: '',
          },
        },
        { runValidators: true },
      )
    }

    await this.invalidateAll()
    await this.invalidateById(id)
  }

  /**
   * Опублікувати добовий батч популярних:
   * 1) Спочатку всі queued з forceToday=true (за queuedAt, FIFO)
   * 2) Далі звичайні queued (FIFO)
   * В сумі не більше limit.
   */
  public async publishDailyPopularBatch(
    limit: number,
  ): Promise<{ published: number; batchDate: Date }> {
    const n = Math.max(1, Math.min(50, Number(limit) || 8))
    const batchDate = new Date()
    // нормалізуємо до початку доби (UTC)
    const startOfDay = new Date(Date.UTC(batchDate.getUTCFullYear(), batchDate.getUTCMonth(), batchDate.getUTCDate()))

    // 1) Пріоритетні
    const forced = await this.caseModel
      .find({ popularQueued: true, popularActive: { $ne: true }, forceToday: true })
      .sort({ queuedAt: 1, _id: 1 })
      .limit(n)
      .select({ _id: 1 })
      .lean()

    const remaining = n - forced.length

    // 2) Звичайні
    const normal =
      remaining > 0
        ? await this.caseModel
            .find({
              popularQueued: true,
              popularActive: { $ne: true },
              $or: [{ forceToday: { $ne: true } }, { forceToday: { $exists: false } }],
            })
            .sort({ queuedAt: 1, _id: 1 })
            .limit(remaining)
            .select({ _id: 1 })
            .lean()
        : []

    const ids = [...forced, ...normal].map((d) => d._id)
    if (!ids.length) return { published: 0, batchDate: startOfDay }

    const now = new Date()

    const res = await this.caseModel.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          popularActive: true,
          popularBatchDate: startOfDay,
          popularPublishedAt: now,
          status: 'published', // гарантуємо видимість
        },
        $unset: { forceToday: '' },
      },
      { runValidators: true },
    )

    await this.invalidateAll()

    return { published: (res as any)?.modifiedCount || ids.length, batchDate: startOfDay }
  }

  /**
   * MVP-апдейт engagement + lifeScore.
   * Вхідні інкременти опційні; lifeScore змінюється за вагами.
   */
  public async bumpEngagement(
    id: string,
    inc: { views?: number; saves?: number; shares?: number; refsLikes?: number },
  ): Promise<{ ok: true; lifeScore: number }> {
    ensureObjectId(id)

    // Ваги (можеш винести в .env при бажанні)
    const W = {
      views: Number(process.env.LIFE_W_VIEWS ?? 0.2),
      saves: Number(process.env.LIFE_W_SAVES ?? 3),
      shares: Number(process.env.LIFE_W_SHARES ?? 4),
      refsLikes: Number(process.env.LIFE_W_REFSLIKES ?? 2),
      cap: Number(process.env.LIFE_CAP ?? 1000),
    }

    const incViews = Math.max(0, Math.floor(inc.views ?? 0))
    const incSaves = Math.max(0, Math.floor(inc.saves ?? 0))
    const incShares = Math.max(0, Math.floor(inc.shares ?? 0))
    const incRefs = Math.max(0, Math.floor(inc.refsLikes ?? 0))

    // lifeDelta = сума ваг * інкременти
    const lifeDelta = (incViews * W.views) + (incSaves * W.saves) + (incShares * W.shares) + (incRefs * W.refsLikes)

    // Атомарно підняти лічильники та lifeScore (із капом)
    const doc = await this.caseModel.findById(id).select({ lifeScore: 1 }).lean()
    if (!doc) throw new NotFoundException('Case not found')

    const newScore = Math.min(W.cap, Math.max(0, (doc.lifeScore ?? 0) + lifeDelta))

    await this.caseModel.updateOne(
      { _id: id },
      {
        $inc: {
          ...(incViews ? { views: incViews } : {}),
          ...(incSaves ? { saves: incSaves } : {}),
          ...(incShares ? { shares: incShares } : {}),
          ...(incRefs ? { refsLikes: incRefs } : {}),
        },
        $set: { lifeScore: newScore },
      },
      { runValidators: true },
    )

    // інвалідуємо тільки те, що реально впливає на сортування
    await this.cache.del(`${this.prefix}discover`) // усі discover-* ключі
    await this.invalidateById(id)

    return { ok: true, lifeScore: newScore }
  }

  /**
   * Годинний decay lifeScore (за замовчуванням — тільки у тих, хто в Popular).
   * Значення зменшується, не опускаючись нижче 0.
   */
  public async decayLifeScoresHourly(
    opts?: { onlyPopular?: boolean; decay?: number },
  ): Promise<{ matched: number; modified: number }> {
    const onlyPopular = opts?.onlyPopular ?? true
    const decay = Math.max(0, Number(opts?.decay ?? process.env.LIFE_DECAY_PER_HOUR ?? 5))

    const q: any = { status: 'published' }
    if (onlyPopular) q.popularActive = true

    // Зменшити lifeScore, але не нижче 0 — робимо через pipeline update
    const res = await this.caseModel.updateMany(
      q,
      [
        {
          $set: {
            lifeScore: {
              $max: [
                0,
                { $subtract: ['$lifeScore', decay] },
              ],
            },
          },
        },
      ] as any,
      { strict: false },
    )

    // lifeScore впливає на discover сортування → інвалідуємо discover кеш
    await this.cache.del(`${this.prefix}discover`)

    return { matched: (res as any)?.matchedCount ?? 0, modified: (res as any)?.modifiedCount ?? 0 }
  }

  /**
   * Зняти кейс з Popular.
   * - Якщо returnToQueue=true — повертаємо до curated-черги (ставимо queuedAt=now, popularQueued=true)
   * - Якщо false/не вказано — повністю прибираємо з черги.
   * ВАЖЛИВО: статус кейсу ("published") не чіпаємо — кейс залишається опублікованим на платформі.
   */
  public async unpublishFromPopular(
    id: string,
    opts?: { returnToQueue?: boolean },
  ): Promise<{ modified: number }> {
    ensureObjectId(id)
    const returnToQueue = !!opts?.returnToQueue

    const $set: Record<string, unknown> = {
      popularActive: false,
    }
    const $unset: Record<string, unknown> = {
      popularBatchDate: '',
      popularPublishedAt: '',
    }

    if (returnToQueue) {
      $set.popularQueued = true
      $set.queuedAt = new Date()
      // якщо був forceToday — не чіпаємо, щоб можна було форснути знову за потреби
    } else {
      $set.popularQueued = false
      $unset.queuedAt = ''
      $unset.forceToday = ''
    }

    const res = await this.caseModel.updateOne(
      { _id: id },
      { $set, $unset },
      { runValidators: true },
    )

    await this.invalidateAll()
    await this.invalidateById(id)

    return { modified: (res as any)?.modifiedCount ?? 0 }
  }

  /** Зняти кейс із Popular.
   *  keepQueued=true — залишити в curated-черзі (popularQueued=true, queuedAt не чіпаємо)
   *  keepQueued=false — прибрати і з Popular, і з черги
   */
  public async removeFromPopular(
    id: string,
    opts: { keepQueued?: boolean } = {},
  ): Promise<{ ok: true; modified: number }> {
    ensureObjectId(id)
    const keepQueued = !!opts.keepQueued

    const $set: Record<string, any> = {
      popularActive: false,
    }
    const $unset: Record<string, any> = {
      popularBatchDate: '',
      popularPublishedAt: '',
      forceToday: '',
    }

    if (!keepQueued) {
      $set.popularQueued = false
      $unset.queuedAt = ''
    }

    const res = await this.caseModel.updateOne(
      { _id: id },
      { $set, $unset },
      { runValidators: true },
    )

    await this.invalidateAll()
    await this.invalidateById(id)

    return { ok: true, modified: (res as any)?.modifiedCount ?? 0 }
  }

  /** Позначити/зняти кейс як slide (featuredSlides) */
  public async setFeaturedSlide(id: string, featured: boolean) {
    ensureObjectId(id)
    const doc = await this.caseModel.findByIdAndUpdate(
      id,
      { $set: { featuredSlides: !!featured } },
      { new: true, runValidators: true },
    ).lean()
    if (!doc) throw new NotFoundException('Case not found')

    await this.cache.del(this.kPopularSlides(6)) // найчастіше
    await this.invalidateById(id)

    return { ok: true, featuredSlides: !!doc.featuredSlides }
  }

  /** Список queued-черги (для адмінки) */
  public async listCuratedQueue(params: { limit?: number; offset?: number }) {
    const limit = Math.max(1, Math.min(100, Number(params?.limit) || 20))
    const offset = Math.max(0, Number(params?.offset) || 0)

    const [items, total] = await Promise.all([
      this.caseModel
        .find({ popularQueued: true, popularActive: { $ne: true } })
        .sort({ queuedAt: 1 }) // FIFO
        .skip(offset)
        .limit(limit)
        .select({
          title: 1, cover: 1, categories: 1, industry: 1,
          popularQueued: 1, queuedAt: 1, forceToday: 1, status: 1, updatedAt: 1,
        })
        .lean(),
      this.caseModel.countDocuments({ popularQueued: true, popularActive: { $ne: true } }),
    ])

    return { items, total, limit, offset }
  }

  /** Список активних у Popular (поточний/усі), для адмінки */
  public async listPopularActive(params: { limit?: number; offset?: number; batchDate?: string }) {
    const limit = Math.max(1, Math.min(100, Number(params?.limit) || 20))
    const offset = Math.max(0, Number(params?.offset) || 0)

    const q: any = { popularActive: true }
    if (params?.batchDate) {
      // якщо передали точну дату батча (початок доби UTC)
      const d = new Date(params.batchDate)
      if (!isNaN(d.getTime())) q.popularBatchDate = d
    }

    const [items, total] = await Promise.all([
      this.caseModel
        .find(q)
        .sort({ popularBatchDate: -1, lifeScore: -1, popularPublishedAt: -1 })
        .skip(offset)
        .limit(limit)
        .select({
          title: 1, cover: 1, categories: 1, industry: 1,
          popularActive: 1, popularBatchDate: 1, popularPublishedAt: 1,
          lifeScore: 1, status: 1, updatedAt: 1,
        })
        .lean(),
      this.caseModel.countDocuments(q),
    ])

    return { items, total, limit, offset }


  }

  /** ---------------- VOTES ---------------- */

/**
 * Голосування за кейс
 * @param caseId id кейса
 * @param user користувач (id + role)
 * @param scores об'єкт { design, creativity, content }
 */
async voteCase(
  caseId: string,
  user: { id: string; role: 'user' | 'jury' },
  scores: { design: number; creativity: number; content: number },
) {
  if (!isValidObjectId(caseId)) throw new BadRequestException('Invalid caseId')
  if (!isValidObjectId(user.id)) throw new BadRequestException('Invalid userId')

  const design = Math.min(10, Math.max(0, Number(scores.design)))
  const creativity = Math.min(10, Math.max(0, Number(scores.creativity)))
  const content = Math.min(10, Math.max(0, Number(scores.content)))
  const overall = Math.round(((design + creativity + content) / 3) * 10) / 10

  const voteModel = this.caseModel.db.model('CaseVote')
  await voteModel.updateOne(
    { caseId, userId: user.id },
    { $set: { design, creativity, content, overall, voterRole: user.role } },
    { upsert: true },
  )

  // оновлюємо середній бейдж у кейсі
  const agg = await voteModel.aggregate([
    { $match: { caseId: new (require('mongoose').Types.ObjectId)(caseId) } },
    {
      $group: {
        _id: null,
        design: { $avg: '$design' },
        creativity: { $avg: '$creativity' },
        content: { $avg: '$content' },
        overall: { $avg: '$overall' },
      },
    },
  ])

  if (agg.length) {
    const avg = agg[0]
    await this.caseModel.updateOne(
      { _id: caseId },
      { $set: { badge: avg } },
      { runValidators: false },
    )
  }

  return { ok: true, overall }
}

/**
 * Отримати список голосів по кейсу
 */
async getCaseVotes(params: {
  caseId: string
  role?: 'user' | 'jury'
  page?: number
  limit?: number
}) {
  const { caseId, role } = params
  if (!isValidObjectId(caseId)) throw new BadRequestException('Invalid caseId')

  const page = Math.max(1, Number(params.page) || 1)
  const limit = Math.min(50, Math.max(1, Number(params.limit) || 12))
  const skip = (page - 1) * limit

  const voteModel = this.caseModel.db.model('CaseVote')

  const filter: any = { caseId }
  if (role) filter.voterRole = role

  const [items, total] = await Promise.all([
    voteModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
       .populate('userId', 'name avatar roles teamName')
      .lean(),
    voteModel.countDocuments(filter),
  ])

  return { items, total, page, limit }

}

/** ---------------- UNIQUE VIEWS ---------------- */

/**
 * Позначити унікальний перегляд кейса.
 * - Якщо є userId → унікальність по userId
 * - Якщо гість → унікальність по anonToken (cookie/uuid)
 * Повертає: { unique: boolean, uniqueViews?: number }
 */
async markUniqueView(
  caseId: string,
  opts: { userId?: string; anonToken?: string },
): Promise<{ unique: boolean; uniqueViews?: number }> {
  if (!isValidObjectId(caseId)) throw new BadRequestException('Invalid caseId')

  const userId = opts?.userId && isValidObjectId(opts.userId) ? opts.userId : undefined
  const anonToken = !userId && typeof opts?.anonToken === 'string' ? (opts.anonToken.trim() || undefined) : undefined

  // якщо немає жодного ідентифікатора — не інкрементимо
  if (!userId && !anonToken) {
    return { unique: false }
  }

  // використовуємо зареєстровану модель CaseView (через підключену в модулі схему)
  const caseViewModel = this.caseModel.db.model('CaseView')

  try {
    // пробуємо створити запис перегляду
    await caseViewModel.create({
      caseId,
      ...(userId ? { userId } : { anonToken }),
    })

    // якщо новий запис створено — інкрементимо лічильник uniqueViews у кейсі
    const res = await this.caseModel.findByIdAndUpdate(
      caseId,
      { $inc: { uniqueViews: 1 } },
      { new: true, projection: { uniqueViews: 1 } as any },
    ).lean()

    return { unique: true, uniqueViews: (res as any)?.uniqueViews ?? undefined }
  } catch {
    // duplicate key → уже рахували цей перегляд (для цього userId/anonToken)
    return { unique: false }
  }
}

/** ---------------- CASE PAGE (detail) ---------------- */

private isObjectIdLike(v: string) {
  return typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v.trim());
}

/**
 * Детальна сторінка кейса за id або slug.
 * Повертає: сам кейс (з owner/contributors), колекції, moreFromAuthor, similar
 * Кеш: 2 хвилини.
 */
async getCasePage(idOrSlug: string) {
  const cacheKey = `cases:page:${idOrSlug}`;
  const hit = await this.cache.get<any>(cacheKey);
  if (hit) return hit;

  // 1) сам кейс + власник + контриб'ютори
  const match = this.isObjectIdLike(idOrSlug)
    ? { _id: idOrSlug }
    : { slug: idOrSlug };

  const caseDoc = await this.caseModel
    .findOne(match)
    .populate('ownerId', 'name avatar email roles')
    .populate('contributors.userId', 'name avatar roles')
    .lean();

  if (!caseDoc) throw new NotFoundException('Case not found');

  // 2) колекції, до яких входить кейс (титул + slug)
  const collections = await this.collectionModel
    .find({ cases: caseDoc._id }, { title: 1, slug: 1 })
    .sort({ order: 1, updatedAt: -1 })
    .lean();

  // 3) more from author
  const ownerId =
    typeof caseDoc.ownerId === 'object' && caseDoc.ownerId !== null
      ? String((caseDoc.ownerId as any)._id)
      : String(caseDoc.ownerId);

  const ownerCount = await this.caseModel.countDocuments({ ownerId, status: 'published' });

  let moreFromAuthor: any[] = [];
  if (ownerCount >= 3) {
    moreFromAuthor = await this.caseModel
      .find({ ownerId, status: 'published', _id: { $ne: caseDoc._id } })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(6)
      .select({
        title: 1, industry: 1, categories: 1, tags: 1,
        cover: 1, videos: 1, status: 1, lifeScore: 1,
        createdAt: 1, updatedAt: 1, publishedAt: 1,
      })
      .lean();
  } else {
    const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
    moreFromAuthor = await this.caseModel
      .find({
        status: 'published',
        industry: caseDoc.industry,
        popularPublishedAt: { $gte: monthAgo },
        _id: { $ne: caseDoc._id },
      })
      .sort({ lifeScore: -1, popularPublishedAt: -1, _id: 1 })
      .limit(6)
      .select({
        title: 1, industry: 1, categories: 1, tags: 1,
        cover: 1, videos: 1, status: 1, lifeScore: 1,
        createdAt: 1, updatedAt: 1,
      })
      .lean();
  }

  // 4) similar (4 шт, популярні за місяць у тій же індустрії)
  const similar = await this.getSimilarCases(String(caseDoc._id), String(caseDoc.industry));

  // --- 5) ЛЕДАЧА побудова palette[] якщо її ще нема ---
  try {
    const hasPalette = Array.isArray((caseDoc as any).palette) && (caseDoc as any).palette.length > 0;
    if (!hasPalette) {
      const imgUrls = this.collectImageUrlsFromCase(caseDoc);
      const palette = await this.palette.buildPalette(imgUrls, 8);
      if (palette.length) {
        // зберігаємо в БД для майбутніх звернень
        await this.caseModel.updateOne(
          { _id: caseDoc._id },
          { $set: { palette } },
          { runValidators: false },
        );
        (caseDoc as any).palette = palette;
        // (опційно) можна було б інваліднути вже існуючий кеш id-версії:
        // await this.cache.del(`cases:page:${String(caseDoc._id)}`);
      }
    }
  } catch {
    // не блокуємо відповідь, якщо щось пішло не так
  }

  const data = { ...caseDoc, collections, moreFromAuthor, similar };

  await this.cache.set(cacheKey, data, 120_000); // 2 хв
  return data;
}


/** Схожі кейси (4 шт) — популярні за місяць тієї ж індустрії, без поточного кейса */
async getSimilarCases(caseId: string, industry?: string) {
  const cacheKey = `cases:similar:${caseId}`;
  const hit = await this.cache.get<any[]>(cacheKey);
  if (hit) return hit;

  const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);

  const q: any = {
    status: 'published',
    _id: { $ne: caseId },
    popularPublishedAt: { $gte: monthAgo },
  };
  if (industry) q.industry = industry;

  const items = await this.caseModel
    .find(q)
    .sort({ lifeScore: -1, popularPublishedAt: -1, _id: 1 })
    .limit(4)
    .select({
      title: 1, industry: 1, categories: 1, tags: 1,
      cover: 1, videos: 1, status: 1, lifeScore: 1,
      createdAt: 1, updatedAt: 1,
    })
    .lean();

  await this.cache.set(cacheKey, items, 120_000);
  return items;
}

/**
 * Курсорна пагінація голосів.
 * cursor — ISO-строка createdAt останнього елемента з попередньої сторінки.
 */
async getCaseVotesCursor(params: {
  caseId: string
  role?: 'user' | 'jury'
  limit?: number
  cursor?: string // ISO date (createdAt)
}) {
  const { caseId, role } = params
  if (!isValidObjectId(caseId)) throw new BadRequestException('Invalid caseId')

  const limit = Math.min(50, Math.max(1, Number(params.limit) || 12))
  const cursorDate = params.cursor ? new Date(params.cursor) : null
  if (params.cursor && isNaN(cursorDate!.getTime())) {
    throw new BadRequestException('Invalid cursor')
  }

  const voteModel = this.caseModel.db.model('CaseVote')

  const filter: any = { caseId }
  if (role) filter.voterRole = role
  if (cursorDate) {
    filter.createdAt = { $lt: cursorDate }
  }

  const items = await voteModel
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .populate('userId', 'name avatar roles teamName')
    .lean()

  const nextCursor = items.length
    ? new Date(items[items.length - 1].createdAt).toISOString()
    : null

  return {
    items: items.map((v: any) => ({
      id: String(v._id),
      user: v.userId ? {
        id: String(v.userId._id || v.userId),
        name: (v.userId as any)?.name ?? null,
        avatar: (v.userId as any)?.avatar ?? null,
        roles: (v.userId as any)?.roles ?? [],
        teamName: (v.userId as any)?.teamName ?? null,
      } : null,
      design: v.design,
      creativity: v.creativity,
      content: v.content,
      overall: v.overall,
      role: v.voterRole,
      createdAt: v.createdAt,
    })),
    nextCursor,
    limit,
  }
}

/**
 * Детальна сторінка кейса з урахуванням користувача (myVote + CTA).
 * Базові дані беруться з кешованого getCasePage(idOrSlug), а user-specific поля не кешуються.
 */
async getCasePageForUser(idOrSlug: string, userId?: string) {
  // 1) базові дані (кешовані)
  const base = await this.getCasePage(idOrSlug);

  // 2) за замовчуванням без персоналізації
  let myVote: null | {
    design: number;
    creativity: number;
    content: number;
    overall: number;
    role?: 'user' | 'jury';
  } = null;

  if (userId && isValidObjectId(userId)) {
    type VoteLean = {
      _id: any;
      userId: any;
      caseId: any;
      design: number;
      creativity: number;
      content: number;
      overall: number;
      voterRole: 'user' | 'jury';
      createdAt: Date;
    };

    const voteModel = this.caseModel.db.model('CaseVote');
    const caseId = String((base as any)?._id || (base as any)?.id);
    if (caseId && isValidObjectId(caseId)) {
      const v = (await voteModel.findOne({ caseId, userId }).lean()) as VoteLean | null;
      if (v) {
        myVote = {
          design: v.design,
          creativity: v.creativity,
          content: v.content,
          overall: v.overall,
          role: v.voterRole,
        };
      }
    }
  }

  // 3) badgeLabel — зручно віддати одразу для фронту
  const avgOverall: number | undefined = (base as any)?.badge?.overall;
  const badgeLabel =
    typeof avgOverall === 'number'
      ? avgOverall < 7
        ? 'regular'
        : avgOverall < 8
        ? 'interesting'
        : 'outstanding'
      : null;

  // 4) CTA стан:
  const ctaState = myVote ? 'review' : 'review-and-score';

  return { ...base, myVote, badgeLabel, ctaState };
}

/** Форс-побудова palette[] для кейса */
public async rebuildPalette(caseId: string, opts?: { force?: boolean }) {
  if (!this.isObjectIdLike(caseId)) {
    throw new BadRequestException('Invalid caseId');
  }

  const doc = await this.caseModel.findById(caseId).lean();
  if (!doc) throw new NotFoundException('Case not found');

  const hasPalette = Array.isArray((doc as any).palette) && (doc as any).palette.length > 0;
  if (hasPalette && !opts?.force) {
    return { ok: true, palette: (doc as any).palette, skipped: true };
  }

  const urls = this.collectImageUrlsFromCase(doc);
  const palette = await this.palette.buildPalette(urls, 8);

  if (palette.length) {
    await this.caseModel.updateOne(
      { _id: caseId },
      { $set: { palette } },
      { runValidators: false },
    );
    // інваліднемо кеш детальної сторінки за id і за slug (якщо є)
    await this.cache.del(`cases:page:${caseId}`);
    if (typeof (doc as any).slug === 'string') {
      await this.cache.del(`cases:page:${(doc as any).slug}`);
    }
  }

  return { ok: true, palette, skipped: false };
}




}
