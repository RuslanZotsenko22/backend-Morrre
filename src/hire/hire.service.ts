import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, isValidObjectId } from 'mongoose'
import { HireRequest, HireRequestDocument } from './schemas/hire-request.schema'
import { CreateHireRequestDto, sanitizeCategories } from './dto/create-hire-request.dto'

@Injectable()
export class HireService {
  constructor(
    @InjectModel(HireRequest.name) private hireModel: Model<HireRequestDocument>,
  ) {}

  private ensureId(id: string, field = 'id') {
    if (!isValidObjectId(id)) throw new BadRequestException(`${field} is not a valid ObjectId`)
  }

  async create(toUserId: string, dto: CreateHireRequestDto, files: Express.Multer.File[], fromUserId?: string) {
    this.ensureId(toUserId, 'toUserId')

    const title = (dto.title ?? '').toString().trim()
    if (!title) throw new BadRequestException('title is required')

    const categories = sanitizeCategories(dto.categories)
    const doc = await this.hireModel.create({
      toUserId,
      fromUserId: fromUserId && isValidObjectId(fromUserId) ? fromUserId : undefined,
      title,
      categories,
      budget: (dto.budget ?? '').toString().trim(),
      description: (dto.description ?? '').toString(),
      attachments: (files || []).map(f => ({
        filename: f.filename,
        originalName: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
        url: `/uploads/hire/${f.filename}`,
        path: (f as any).path,
      })),
      status: 'new',
    })

    return doc.toObject()
  }

  /** простий список отриманих заявок для користувача */
  async listForUser(userId: string, limit = 20, page = 1) {
    this.ensureId(userId)
    const n = Math.max(1, Math.min(100, Number(limit) || 20))
    const p = Math.max(1, Number(page) || 1)
    const skip = (p - 1) * n

    const [items, total] = await Promise.all([
      this.hireModel.find({ toUserId: userId }).sort({ createdAt: -1 }).skip(skip).limit(n).lean(),
      this.hireModel.countDocuments({ toUserId: userId }),
    ])

    return { items, total, page: p, limit: n }
  }

  async markSeen(id: string, toUserId: string) {
    this.ensureId(id); this.ensureId(toUserId, 'toUserId')
    const doc = await this.hireModel.findOneAndUpdate(
      { _id: id, toUserId },
      { $set: { status: 'seen' } },
      { new: true },
    )
    if (!doc) throw new NotFoundException('Hire request not found')
    return doc.toObject()
  }
}
