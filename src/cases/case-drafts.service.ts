import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, isValidObjectId } from 'mongoose'
import { CaseDraft, CaseDraftDocument } from './schemas/case-draft.schema'
import { UpsertSectionDto, DraftMetaDto } from './dto/draft.dto'
import { Case, CaseDocument } from './schemas/case.schema'
import * as path from 'path'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import { join } from 'path'
import { VideoQueue } from '../queue/video.queue'

@Injectable()
export class CaseDraftsService {
  constructor(
    @InjectModel(CaseDraft.name) private draftModel: Model<CaseDraftDocument>,
    @InjectModel(Case.name) private caseModel: Model<CaseDocument>,
    private readonly videoQueue: VideoQueue,
  ) {}

  private assertId(id: string, name = 'id') {
    if (!isValidObjectId(id)) throw new BadRequestException(`${name} invalid`)
  }

  private normalizeIframe(platform: 'youtube' | 'vimeo', url: string) {
    try {
      const u = new URL(url)
      if (platform === 'youtube') {
        const id = u.hostname.includes('youtu.be')
          ? u.pathname.slice(1)
          : u.searchParams.get('v')
        if (!id) throw new BadRequestException('Invalid YouTube URL')
        return `https://www.youtube.com/embed/${id}`
      }
      if (platform === 'vimeo') {
        const m = u.pathname.match(/\/(\d+)/)
        if (!m) throw new BadRequestException('Invalid Vimeo URL')
        return `https://player.vimeo.com/video/${m[1]}`
      }
    } catch {
      throw new BadRequestException('Invalid iframe URL')
    }
    throw new BadRequestException('Unsupported platform')
  }

  async create(ownerId: string) {
    this.assertId(ownerId, 'ownerId')
    const draft = await this.draftModel.create({
      ownerId,
      sections: [],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    return draft.toObject()
  }

  async get(ownerId: string, draftId: string) {
    this.assertId(ownerId, 'ownerId')
    this.assertId(draftId, 'draftId')
    const doc = await this.draftModel.findOne({ _id: draftId, ownerId }).lean()
    if (!doc) throw new NotFoundException('Draft not found')
    return doc
  }

  async upsertSection(ownerId: string, draftId: string, dto: UpsertSectionDto) {
    const draft = await this.get(ownerId, draftId)
    const sections = Array.isArray(draft.sections) ? [...draft.sections] : []

    sections[dto.sectionIndex] = {
      blocks: dto.blocks.map((b) => ({
        kind: b.kind,
        textMd: b.textMd,
        iframePlatform: b.iframePlatform,
        iframeUrl:
          b.iframePlatform && b.iframeUrl
            ? this.normalizeIframe(b.iframePlatform, b.iframeUrl)
            : b.iframeUrl,
        mediaType: b.mediaType,
        mediaUrl: b.mediaUrl,
        style: { borderRadius: b.borderRadius ?? 0, gap: b.gap ?? 0 },
      })),
    }

    // ущільнення (уникнути sparse)
    const compact = sections.map((s) => s || null).filter(Boolean)
    if (compact.length > 100) throw new BadRequestException('Too many sections (>100)')

    await this.draftModel.updateOne({ _id: draftId }, { $set: { sections: compact } })
    return { ok: true }
  }

  async setMeta(ownerId: string, draftId: string, meta: DraftMetaDto) {
    await this.get(ownerId, draftId)

    if (meta.categories?.length > 3) throw new BadRequestException('Max 3 categories')
    if (meta.tags?.length > 20) throw new BadRequestException('Max 20 tags')

    const normLower32 = (s: string) => s?.trim().toLowerCase().slice(0, 32)
    const norm32 = (s: string) => s?.trim().slice(0, 32)

    const categories = Array.from(
      new Set((meta.categories || []).map(normLower32).filter(Boolean)),
    ).slice(0, 3)

    const tags = Array.from(
      new Set((meta.tags || []).map(norm32).filter(Boolean)),
    ).slice(0, 20)

    const industry = (meta.industry || '').trim()

    await this.draftModel.updateOne(
      { _id: draftId, ownerId },
      { $set: { title: (meta.title || '').trim(), industry, categories, tags } },
    )
    return { ok: true }
  }

  /** Завантажене зображення в Draft: повернемо url */
  async attachImageToBlock(
    ownerId: string,
    draftId: string,
    sectionIndex: number,
    blockIndex: number,
    file: Express.Multer.File,
  ) {
    const draft = await this.get(ownerId, draftId)
    const s = draft.sections?.[sectionIndex]
    if (!s) throw new BadRequestException('Section not found')
    const b = s.blocks?.[blockIndex]
    if (!b) throw new BadRequestException('Block not found')

    b.kind = 'media'
    b.mediaType = 'image'
    b.mediaUrl = `/uploads/cases/${draftId}/${file.filename}`

    await this.draftModel.updateOne(
      { _id: draftId, ownerId },
      { $set: { [`sections.${sectionIndex}.blocks.${blockIndex}`]: b } },
    )

    return { ok: true, url: b.mediaUrl }
  }

  /** Пуш відео у Vimeo через чергу */
  async attachVideoToBlock(
    ownerId: string,
    draftId: string,
    sectionIndex: number,
    blockIndex: number,
    localTmpPath: string,
  ) {
    await this.get(ownerId, draftId)

    await this.videoQueue.enqueueUploadEnhanced({
  caseId: draftId,
  filePath: localTmpPath,
  ensureFolder: true,
  // ➕ координати блоку, щоб вебхук знав, куди ставити playerUrl
  sectionIndex,
  blockIndex,
})


    await this.draftModel.updateOne(
      { _id: draftId, ownerId },
      {
        $set: {
          [`sections.${sectionIndex}.blocks.${blockIndex}.kind`]: 'media',
          [`sections.${sectionIndex}.blocks.${blockIndex}.mediaType`]: 'video',
          [`sections.${sectionIndex}.blocks.${blockIndex}.mediaUrl`]: 'processing://vimeo',
        },
      },
    )

    return { ok: true }
  }

  private remapUrlsToCase(content: any[], draftId: string, caseId: string) {
    const from = `/uploads/cases/${draftId}/`
    const to = `/uploads/cases/${caseId}/`
    return (content || []).map((s: any) => ({
      ...s,
      blocks: (s.blocks || []).map((b: any) => ({
        ...b,
        mediaUrl:
          typeof b.mediaUrl === 'string' ? b.mediaUrl.replace(from, to) : b.mediaUrl,
      })),
    }))
  }

  private async moveDraftFolderToCase(draftId: string, caseId: string) {
    const base = join(process.cwd(), 'uploads', 'cases')
    const from = join(base, draftId)
    const to = join(base, caseId)
    try {
      if (fs.existsSync(from)) {
        await fsp.mkdir(base, { recursive: true })
        await fsp.rm(to, { recursive: true, force: true })
        await fsp.rename(from, to)
      }
    } catch (e) {
      // не зриваємо публікацію — залогуємо
      console.error('moveDraftFolderToCase error', e)
    }
  }

  /** Публікація → створюємо Case і видаляємо Draft + переносимо мету/контент/файли */
  async publish(ownerId: string, draftId: string) {
    const draft = await this.get(ownerId, draftId)
    if (!draft.title?.trim()) throw new BadRequestException('Title required')
    if (!draft.industry?.trim()) throw new BadRequestException('Industry required')

    const caseDoc = await this.caseModel.create({
      ownerId,
      title: draft.title,
      industry: draft.industry,
      categories: draft.categories || [],
      tags: draft.tags || [],
      contributors: draft.contributors || [],
      content: [], // оновимо після переносу
      cover: draft.cover || null,
    })

    await this.moveDraftFolderToCase(draftId, caseDoc._id.toString())
    const remapped = this.remapUrlsToCase(draft.sections || [], draftId, caseDoc._id.toString())
    await this.caseModel.updateOne({ _id: caseDoc._id }, { $set: { content: remapped } })

    await this.draftModel.deleteOne({ _id: draftId, ownerId })

    return { ok: true, caseId: caseDoc._id.toString() }
  }

  /** Видалення фінального кейса з файлами та Vimeo */
  async deleteCase(ownerId: string, caseId: string) {
    this.assertId(ownerId, 'ownerId')
    this.assertId(caseId, 'caseId')

    const doc = await this.caseModel.findOne({ _id: caseId, ownerId })
    if (!doc) throw new NotFoundException('Case not found')

    // 1) локальні файли
    const dir = path.resolve(process.cwd(), 'uploads', 'cases', caseId)
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }

    // 2) Vimeo: у чергу — видалити папку/відео
    await this.videoQueue.enqueueCleanup({ caseId })

    await this.caseModel.deleteOne({ _id: caseId })
    return { ok: true }
  }

// ======== ДОДАТИ ВСЕРЕДИНУ класу CaseDraftsService ========

/** Хелпер: витягнути Vimeo ID з будь-якого vimeo URL */
private extractVimeoId(url?: string) {
  if (!url) return null
  // підтримує player.vimeo.com/video/123, vimeo.com/123, ...?param=...
  const m = String(url).match(/vimeo\.com\/(?:video\/)?(\d+)/i)
  return m ? m[1] : null
}

/**
 * Точкове оновлення одного блоку (зміна типу, полів, стилю).
 * Якщо було відео Vimeo і замінюємо на зображення/інший тип — ставимо job на видалення відео.
 */
async updateBlock(
  ownerId: string,
  draftId: string,
  sectionIndex: number,
  blockIndex: number,
  dto: import('./dto/block-update.dto').UpdateBlockDto,
) {
  const draft = await this.get(ownerId, draftId)
  const s = draft.sections?.[sectionIndex]
  if (!s) throw new (await import('@nestjs/common')).BadRequestException('Section not found')
  const b = s.blocks?.[blockIndex]
  if (!b) throw new (await import('@nestjs/common')).BadRequestException('Block not found')

  const prev = { ...b }

  // Оновлюємо поля за DTO
  if (dto.kind) b.kind = dto.kind
  if (typeof dto.textMd === 'string') b.textMd = dto.textMd

  if (dto.iframePlatform) b.iframePlatform = dto.iframePlatform
  if (typeof dto.iframeUrl === 'string') b.iframeUrl = dto.iframeUrl

  if (dto.mediaType) b.mediaType = dto.mediaType
  if (typeof dto.mediaUrl === 'string') b.mediaUrl = dto.mediaUrl

  // Стиль
  b.style = {
    borderRadius: dto.borderRadius ?? b.style?.borderRadius ?? 0,
    gap: dto.gap ?? b.style?.gap ?? 0,
  }

  // Якщо було Vimeo-відео, а стало не-відео → пробуємо видалити конкретне відео у Vimeo
  const wasVimeo =
    prev.mediaType === 'video' &&
    typeof prev.mediaUrl === 'string' &&
    /vimeo\.com/i.test(prev.mediaUrl)

  const nowVideo = b.kind === 'media' && b.mediaType === 'video'

  if (wasVimeo && !nowVideo) {
    const vimeoId = this.extractVimeoId(prev.mediaUrl)
    if (vimeoId) {
      // точкове видалення відео (не всю папку)
      await this.videoQueue.enqueueDeleteVideo({ caseId: draftId, vimeoId })
    }
  }

  await this.draftModel.updateOne(
    { _id: draftId, ownerId },
    { $set: { [`sections.${sectionIndex}.blocks.${blockIndex}`]: b } },
  )

  return { ok: true }
}

/** Видалити медіа із блоку (очистити mediaType/mediaUrl). Якщо відео Vimeo — ставимо job на видалення. */
async removeBlockMedia(ownerId: string, draftId: string, sectionIndex: number, blockIndex: number) {
  const draft = await this.get(ownerId, draftId)
  const s = draft.sections?.[sectionIndex]
  if (!s) throw new (await import('@nestjs/common')).BadRequestException('Section not found')
  const b = s.blocks?.[blockIndex]
  if (!b) throw new (await import('@nestjs/common')).BadRequestException('Block not found')

  // якщо було Vimeo — видалимо відео
  if (b.mediaType === 'video' && typeof b.mediaUrl === 'string' && /vimeo\.com/i.test(b.mediaUrl)) {
    const vimeoId = this.extractVimeoId(b.mediaUrl)
    if (vimeoId) await this.videoQueue.enqueueDeleteVideo({ caseId: draftId, vimeoId })
  }

  // якщо було локальне зображення — нічого не робимо (опціонально: видалити файл з диску)
  // const localPath = b.mediaType === 'image' ? b.mediaUrl : null

  // чистимо медіа-поля, але залишаємо kind='media' (або переведи у 'text' за бажанням)
  b.mediaType = undefined
  b.mediaUrl = undefined
  b.kind = 'media'

  await this.draftModel.updateOne(
    { _id: draftId, ownerId },
    { $set: { [`sections.${sectionIndex}.blocks.${blockIndex}`]: b } },
  )

  return { ok: true }
}

  
}
