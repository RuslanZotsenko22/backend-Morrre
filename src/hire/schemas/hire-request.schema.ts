import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument } from 'mongoose'

export type HireRequestDocument = HydratedDocument<HireRequest>

@Schema({ timestamps: true })
export class HireRequest {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true })
  toUserId!: string

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, index: true })
  fromUserId?: string

  @Prop({ type: String, required: true, trim: true })
  title!: string

  @Prop({ type: [String], default: [] })
  categories!: string[]

  @Prop({ type: String, default: '' })
  budget?: string

  @Prop({ type: String, default: '' })
  description?: string

  @Prop({
    type: [
      {
        filename: String,
        originalName: String,
        mimeType: String,
        size: Number,
        url: String,
        path: String,
      },
    ],
    default: [],
  })
  attachments!: Array<{
    filename: string
    originalName: string
    mimeType: string
    size: number
    url?: string
    path?: string
  }>

  @Prop({ type: String, default: 'new', index: true })
  status!: 'new' | 'seen' | 'replied' | 'closed'

  /** коротка відповідь автору (остання) */
  @Prop({ type: String, default: '' })
  lastReplyMessage?: string

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false })
  lastRepliedBy?: string

  @Prop({ type: Date })
  lastRepliedAt?: Date
}

export const HireRequestSchema = SchemaFactory.createForClass(HireRequest)
HireRequestSchema.index({ toUserId: 1, createdAt: -1 }, { name: 'idx_hire_toUser_recent' })
