import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument } from 'mongoose'

export type VoteDocument = HydratedDocument<Vote>

@Schema({ timestamps: true })
export class Vote {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Case', required: true, index: true })
  caseId!: string

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: string

  @Prop({ type: Number, min: 0, max: 10, required: true })
  design!: number

  @Prop({ type: Number, min: 0, max: 10, required: true })
  creativity!: number

  @Prop({ type: Number, min: 0, max: 10, required: true })
  content!: number
}

export const VoteSchema = SchemaFactory.createForClass(Vote)

/** 1 голос на користувача по кейсу */
VoteSchema.index({ caseId: 1, userId: 1 }, { unique: true, name: 'uniq_case_user_vote' })
/** для пагінації (останні спочатку) */
VoteSchema.index({ caseId: 1, createdAt: -1, _id: -1 }, { name: 'idx_case_created_desc' })
