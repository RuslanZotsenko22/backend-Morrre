import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, isValidObjectId } from 'mongoose'
import { Collection, CollectionDocument } from './schemas/collection.schema'
import { Case, CaseDocument } from '../cases/schemas/case.schema'
import { CreateCollectionDto } from './dto/create-collection.dto'
import { UpdateCollectionDto } from './dto/update-collection.dto'
import { RedisCacheService } from '../common/redis/redis-cache.service'

const CASE_CARD_PROJECTION = {
  title: 1,
  industry: 1,
  categories: 1,
  tags: 1,
  cover: 1,
  videos: 1,
  status: 1,
  popularActive: 1,
  lifeScore: 1,
  createdAt: 1,
  updatedAt: 1,
}

@Injectable()
export class CollectionsService {
  private readonly ttlMs = 300_000 // 5 хв

  constructor(
    @InjectModel(Collection.name) private colModel: Model<CollectionDocument>,
    @InjectModel(Case.name) private caseModel: Model<CaseDocument>,
    private readonly cache: RedisCacheService,
  ) {}

  private ensureId(id: string, field = 'id') {
    if (!isValidObjectId(id)) throw new BadRequestException(`${field} is not a valid ObjectId`)
  }

  private slugify(s: string) {
    return (s ?? '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
  }

  /** ---------------- internal (CRUD) ---------------- */

  async create(dto: CreateCollectionDto) {
    const title = (dto.title ?? '').trim()
    if (!title) throw new BadRequestException('title is required')

    const slug = dto.slug ?? this.slugify(title)
    if (!slug) throw new BadRequestException('slug is required')

    if (await this.colModel.exists({ slug })) {
      throw new BadRequestException('slug already exists')
    }

    const doc = await this.colModel.create({
      title,
      slug,
      description: dto.description ?? '',
      cover: dto.cover ?? null,
      cases: Array.isArray(dto.cases) ? dto.cases.filter(isValidObjectId) : [],
      featured: !!dto.featured,
      order: Number.isFinite(dto.order) ? Number(dto.order) : 0,
    })

    // інвалідація кешу
    await this.cache.del('collections:')
    await this.cache.del(`collections:slug:${doc.slug}`)

    return doc.toObject()
  }

  async update(id: string, patch: UpdateCollectionDto) {
    this.ensureId(id)
    const update: any = {}

    if (typeof patch.title === 'string') {
      const t = patch.title.trim()
      if (!t) throw new BadRequestException('title must be non-empty')
      update.title = t
    }

    if (typeof patch.slug === 'string') {
      const s = patch.slug.trim().toLowerCase()
      if (!s) throw new BadRequestException('slug must be non-empty')
      update.slug = s
    }

    if (typeof patch.description === 'string') update.description = patch.description

    if (patch.cover === null) update.cover = null
    else if (patch.cover && typeof patch.cover === 'object') {
      if (!patch.cover.url || !patch.cover.type) throw new BadRequestException('invalid cover')
      update.cover = patch.cover
    }

    if (Array.isArray(patch.cases)) {
      update.cases = patch.cases.filter(isValidObjectId)
    }

    if (typeof patch.featured === 'boolean') update.featured = patch.featured
    if (typeof patch.order === 'number') update.order = patch.order

    const doc = await this.colModel.findByIdAndUpdate(id, { $set: update }, { new: true })
    if (!doc) throw new NotFoundException('Collection not found')

    // інвалідація кешу
    await this.cache.del('collections:')
    await this.cache.del(`collections:slug:${doc.slug}`)

    return doc.toObject()
  }

  async remove(id: string) {
    this.ensureId(id)
    const doc = await this.colModel.findById(id).lean()
    const res = await this.colModel.deleteOne({ _id: id })

    // інвалідація кешу
    await this.cache.del('collections:')
    if (doc?.slug) await this.cache.del(`collections:slug:${doc.slug}`)

    return { deleted: res.deletedCount ?? 0 }
  }

  async bulkReorder(items: { id: string; order: number }[]) {
    const ops = items
      .filter(i => isValidObjectId(i.id) && Number.isFinite(i.order))
      .map(i => ({ updateOne: { filter: { _id: i.id }, update: { $set: { order: i.order } } } }))
    if (!ops.length) throw new BadRequestException('No valid items')
    await this.colModel.bulkWrite(ops)

    // інвалідація кешу
    await this.cache.del('collections:')

    return { updated: ops.length }
  }

  async setCasesOrder(id: string, cases: string[]) {
    this.ensureId(id)
    const filtered = Array.isArray(cases) ? cases.filter(isValidObjectId) : []
    const doc = await this.colModel.findByIdAndUpdate(id, { $set: { cases: filtered } }, { new: true })
    if (!doc) throw new NotFoundException('Collection not found')

    // інвалідація кешу
    await this.cache.del('collections:')
    await this.cache.del(`collections:slug:${doc.slug}`)

    return doc.toObject()
  }

  /** ---------------- public (read) ---------------- */

  /** featured для головної (limit = 6 за замовчуванням) */
  async getFeatured(limit = 6) {
    const n = Math.max(1, Math.min(24, Number(limit) || 6))
    const key = `collections:featured:${n}`

    const hit = await this.cache.get<any>(key)
    if (hit) return hit

    const data = await this.colModel
      .find({ featured: true })
      .sort({ order: 1, updatedAt: -1 })
      .limit(n)
      .lean()

    await this.cache.set(key, data, this.ttlMs)
    return data
  }

  /** список колекцій з пагінацією */
  async list(params: { page?: number; limit?: number }) {
    const page = Math.max(1, Math.floor(params.page ?? 1))
    const limit = Math.max(1, Math.min(100, Math.floor(params.limit ?? 20)))
    const key = `collections:list:p${page}:l${limit}`

    const hit = await this.cache.get<any>(key)
    if (hit) return hit

    const skip = (page - 1) * limit
    const [items, total] = await Promise.all([
      this.colModel
        .find({})
        .sort({ order: 1, updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.colModel.countDocuments({}),
    ])

    const res = { items, total, page, limit }
    await this.cache.set(key, res, this.ttlMs)
    return res
  }

  /** детальна колекція за slug + картки кейсів (status=published), порядок збережено */
  async bySlug(slug: string) {
    const key = `collections:slug:${slug}`

    const hit = await this.cache.get<any>(key)
    if (hit) return hit

    const col = await this.colModel.findOne({ slug }).lean()
    if (!col) throw new NotFoundException('Collection not found')

    const ids: string[] = Array.isArray(col.cases) ? col.cases : []
    if (!ids.length) {
      const res = { ...col, cases: [] }
      await this.cache.set(key, res, this.ttlMs)
      return res
    }

    const cases = await this.caseModel
      .find({ _id: { $in: ids }, status: 'published' })
      .select(CASE_CARD_PROJECTION)
      .lean()

    const map = new Map(cases.map(c => [String(c._id), c]))
    const ordered = ids.map(id => map.get(String(id))).filter(Boolean)

    const res = { ...col, cases: ordered }
    await this.cache.set(key, res, this.ttlMs)
    return res
  }
}
