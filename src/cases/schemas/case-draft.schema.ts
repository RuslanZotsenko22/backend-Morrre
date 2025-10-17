import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument } from 'mongoose'

export type CaseDraftDocument = HydratedDocument<CaseDraft>

@Schema({ _id: false })
class DraftBlockStyle {
  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  borderRadius!: number

  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  gap!: number
}

@Schema({ _id: false })
class DraftBlock {
  @Prop({ type: String, enum: ['text', 'iframe', 'media'], required: true })
  kind!: 'text' | 'iframe' | 'media'

  // text
  @Prop({ type: String })
  textMd?: string

  // iframe
  @Prop({ type: String, enum: ['youtube', 'vimeo'] })
  iframePlatform?: 'youtube' | 'vimeo'
  @Prop({ type: String })
  iframeUrl?: string

  // media
  @Prop({ type: String, enum: ['image', 'video'] })
  mediaType?: 'image' | 'video'
  @Prop({ type: String })
  mediaUrl?: string

 
  @Prop({ type: String, enum: ['queued','uploading','processing','ready','failed'], default: undefined })
  mediaStatus?: 'queued' | 'uploading' | 'processing' | 'ready' | 'failed'

  @Prop({ type: String, default: undefined })
  vimeoId?: string

  @Prop({ type: String, default: undefined })
  mediaError?: string

  @Prop({ type: DraftBlockStyle, default: () => ({}) })
  style!: DraftBlockStyle
}

@Schema({ _id: false })
class DraftSection {
  @Prop({
    type: [DraftBlock],
    validate: [
      (arr: DraftBlock[]) => Array.isArray(arr) && arr.length >= 1 && arr.length <= 3,
      'blocks must be 1..3',
    ],
  })
  blocks!: DraftBlock[]
}

@Schema({ _id: false })
class DraftCover {
  @Prop({ type: String, enum: ['image', 'video'], required: true })
  type!: 'image' | 'video'

  @Prop({ type: String, required: true })
  url!: string

  @Prop({
    type: {
      low: { type: String },
      mid: { type: String },
      full: { type: String },
    },
    default: undefined, // важливо: не null
  })
  sizes?: { low?: string; mid?: string; full?: string }
}
const DraftCoverSchema = SchemaFactory.createForClass(DraftCover)

@Schema({ timestamps: true })
export class CaseDraft {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId!: string

  /** секції 0..100 */
  @Prop({
    type: [DraftSection],
    validate: [
      (arr: DraftSection[]) => Array.isArray(arr) && arr.length >= 0 && arr.length <= 100,
      'sections must be 0..100',
    ],
    default: [],
  })
  sections!: DraftSection[]

  /** крок 2 (мета перед публікацією) */
  @Prop({ type: String, trim: true, default: '' })
  title!: string

  @Prop({ type: String, default: '' }) // одна індустрія
  industry!: string

  @Prop({ type: [String], default: [] }) // до 3
  categories!: string[]

  @Prop({ type: [String], default: [] }) // до 20
  tags!: string[]

  /** Со-автори [{ userId, title? }] */
  @Prop({
    type: [{ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, title: { type: String } }],
    default: [],
  })
  contributors!: Array<{ userId: string; title?: string }>

  /** Обкладинка (фото або відео) */
  @Prop({ type: DraftCoverSchema, default: undefined }) // важливо: підсхема + undefined
  cover?: DraftCover

  /** Vimeo folder id (для цього кейса/чернетки) */
  @Prop({ type: String, default: '' })
  vimeoFolderId!: string

  /** TTL 24h: якщо не опубліковано — видалиться автоматично */
  @Prop({ type: Date, index: { expires: 0 } })
  expiresAt!: Date
}

export const CaseDraftSchema = SchemaFactory.createForClass(CaseDraft)
CaseDraftSchema.index({ ownerId: 1, createdAt: -1 })
