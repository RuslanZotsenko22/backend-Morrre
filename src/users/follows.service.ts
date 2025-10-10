import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Follow, FollowDocument } from './schemas/follow.schema'

@Injectable()
export class FollowsService {
  constructor(@InjectModel(Follow.name) private followModel: Model<FollowDocument>) {}

  async follow(userId: string, targetId: string) {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(targetId))
      throw new BadRequestException('Invalid id')
    if (userId === targetId) throw new BadRequestException("You can't follow yourself")
    try {
      const doc = await this.followModel.create({ userId, targetUserId: targetId })
      return { ok: true, data: doc.toObject() }
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException('Already following')
      throw e
    }
  }

  async unfollow(userId: string, targetId: string) {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(targetId))
      throw new BadRequestException('Invalid id')
    await this.followModel.deleteOne({ userId, targetUserId: targetId })
    return { ok: true }
  }

  async isFollowing(userId: string, targetId: string) {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(targetId)) return false
    const exists = await this.followModel.exists({ userId, targetUserId: targetId })
    return !!exists
  }
}
