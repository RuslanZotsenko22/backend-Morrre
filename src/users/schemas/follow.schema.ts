import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument } from 'mongoose'

export type FollowDocument = HydratedDocument<Follow>

@Schema({ timestamps: true })
export class Follow {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: string

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true })
  targetUserId!: string
}
export const FollowSchema = SchemaFactory.createForClass(Follow)
FollowSchema.index({ userId: 1, targetUserId: 1 }, { unique: true, name: 'uniq_follow' })
FollowSchema.index({ followerId: 1, targetId: 1 }, { unique: true });
FollowSchema.index({ targetId: 1 });