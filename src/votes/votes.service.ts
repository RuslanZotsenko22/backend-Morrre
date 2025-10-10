import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Vote, VoteDocument } from './schemas/vote.schema'
import { CreateVoteDto } from './dto/create-vote.dto'
import { Case, CaseDocument } from '../cases/schemas/case.schema'
import { User, UserDocument } from '../users/schemas/user.schema'

type RoleFilter = 'all' | 'user' | 'jury'

function encodeCursor(doc: { _id: Types.ObjectId; createdAt: Date }) {
  return Buffer.from(JSON.stringify({ id: doc._id.toString(), t: doc.createdAt.toISOString() })).toString('base64')
}
function decodeCursor(token?: string) {
  if (!token) return null
  try {
    const o = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
    return { _id: new Types.ObjectId(o.id), createdAt: new Date(o.t) }
  } catch {
    throw new BadRequestException('Invalid cursor')
  }
}

@Injectable()
export class VotesService {
  constructor(
    @InjectModel(Vote.name) private voteModel: Model<VoteDocument>,
    @InjectModel(Case.name) private caseModel: Model<CaseDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  /**
   * Створити голос (1 раз на користувача для кейса).
   * Після успішного створення — перерахунок середнього по журі та бейджа в Case.
   */
  async create(caseId: string, userId: string, dto: CreateVoteDto) {
    if (!Types.ObjectId.isValid(caseId)) throw new BadRequestException('Invalid caseId')
    if (!Types.ObjectId.isValid(userId)) throw new BadRequestException('Invalid userId')

    const exists = await this.caseModel.exists({ _id: caseId })
    if (!exists) throw new BadRequestException('Case not found')

    try {
      const vote = await this.voteModel.create({
        caseId,
        userId,
        design: dto.design,
        creativity: dto.creativity,
        content: dto.content,
      })

      // перерахунок середнього jury overall і бейджа
      await this.recomputeJuryBadge(caseId)

      return vote.toObject()
    } catch (e: any) {
      if (e?.code === 11000) {
        // індекс uniq_case_user_vote спрацював
        throw new ConflictException('Already voted')
      }
      throw e
    }
  }

  /**
   * Повертає список голосів із курсором і фільтром за роллю.
   * role береться з Users.role через $lookup (не потребує зберігати роль у Vote).
   */
  async listByCase({
    caseId,
    role = 'all',
    limit = 12,
    cursor,
  }: {
    caseId: string
    role?: RoleFilter
    limit?: number
    cursor?: string
  }) {
    if (!Types.ObjectId.isValid(caseId)) throw new BadRequestException('caseId invalid')
    const n = Math.max(1, Math.min(50, Number(limit) || 12))
    const c = decodeCursor(cursor)

    const match: any = { caseId: new Types.ObjectId(caseId) }
    if (c) {
      // пагінація по createdAt desc, потім _id desc
      match.$or = [
        { createdAt: { $lt: c.createdAt } },
        { createdAt: c.createdAt, _id: { $lt: c._id } },
      ]
    }

    const pipeline: any[] = [
      { $match: match },
      { $sort: { createdAt: -1, _id: -1 } },
      { $limit: n + 1 }, // беремо на 1 більше, щоб зрозуміти чи є next
      // підтягнемо юзера
      {
        $lookup: {
          from: 'users', // назва колекції Users у Mongo
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
          pipeline: [
            { $project: { name: 1, avatar: 1, teamName: 1, role: 1 } },
          ],
        },
      },
      { $unwind: '$user' },
    ]

    // фільтр за роллю (community vs jury)
    if (role === 'user') pipeline.push({ $match: { 'user.role': 'user' } })
    if (role === 'jury') pipeline.push({ $match: { 'user.role': 'jury' } })

    const docs = await this.voteModel.aggregate(pipeline).exec()

    const hasNext = docs.length > n
    const items = (hasNext ? docs.slice(0, n) : docs).map((d: any) => {
      const overall = (d.design + d.creativity + d.content) / 3
      return {
        id: d._id.toString(),
        createdAt: d.createdAt,
        user: {
          id: d.userId.toString(),
          name: d.user?.teamName || d.user?.name || 'User',
          avatar: d.user?.avatar || null,
          teamName: d.user?.teamName || null,
          role: d.user?.role === 'jury' ? 'jury' : 'user',
        },
        scores: {
          design: d.design,
          creativity: d.creativity,
          content: d.content,
          overall: Math.round(overall * 10) / 10,
        },
      }
    })

    const nextCursor = hasNext ? encodeCursor(items[items.length - 1] as any) : null
    return { items, nextCursor }
  }

  /**
   * Агреґація: середній overall серед голосів користувачів із role='jury',
   * оновлення полів у Case: juryAvgOverall та juryBadge.
   */
  private async recomputeJuryBadge(caseId: string) {
    const caseObjId = new Types.ObjectId(caseId)

    const agg = await this.voteModel.aggregate([
      { $match: { caseId: caseObjId } },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
          pipeline: [{ $project: { role: 1 } }],
        },
      },
      { $unwind: '$user' },
      { $match: { 'user.role': 'jury' } },
      {
        $project: {
          _id: 0,
          overall: { $divide: [{ $add: ['$design', '$creativity', '$content'] }, 3] },
        },
      },
      { $group: { _id: null, avg: { $avg: '$overall' } } },
    ]).exec()

    const avg = agg[0]?.avg ?? 0
    let badge: 'regular' | 'interesting' | 'outstanding' = 'regular'
    if (avg >= 8) badge = 'outstanding'
    else if (avg >= 7) badge = 'interesting'

    await this.caseModel.updateOne(
      { _id: caseObjId },
      { $set: { juryAvgOverall: Math.round(avg * 10) / 10, juryBadge: badge } },
    ).exec()
  }

  /**
   * Перевірка: чи голосував користувач за кейс.
   * Повертає { ok: true, voted: boolean }.
   */
  async didUserVote(caseId: string, userId: string) {
    if (!Types.ObjectId.isValid(caseId) || !Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid ids')
    }

    const exists = await this.voteModel.exists({
      caseId: new Types.ObjectId(caseId),
      userId: new Types.ObjectId(userId),
    })

    return { ok: true, voted: !!exists }
  }
}