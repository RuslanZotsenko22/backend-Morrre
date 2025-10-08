import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument } from 'mongoose'

export type CaseVoteDocument = HydratedDocument<CaseVote>

@Schema({ timestamps: true })
export class CaseVote {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Case', index: true, required: true })
  caseId!: string

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true })
  userId!: string

  @Prop({ type: Number, min: 0, max: 10, required: true })
  design!: number

  @Prop({ type: Number, min: 0, max: 10, required: true })
  creativity!: number

  @Prop({ type: Number, min: 0, max: 10, required: true })
  content!: number

  // денорма для швидких списків і агрегацій
  @Prop({ type: Number, min: 0, max: 10, required: true })
  overall!: number

  @Prop({ type: String, enum: ['user', 'jury'], index: true, required: true })
  voterRole!: 'user' | 'jury'
}

export const CaseVoteSchema = SchemaFactory.createForClass(CaseVote)

// Індекси
CaseVoteSchema.index({ caseId: 1, createdAt: -1 }, { name: 'idx_votes_case_created' })
CaseVoteSchema.index({ caseId: 1, voterRole: 1, createdAt: -1 }, { name: 'idx_votes_case_role_created' })
// Один голос на користувача
CaseVoteSchema.index({ caseId: 1, userId: 1 }, { unique: true, name: 'uniq_vote_per_user' })
