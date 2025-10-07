import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument } from 'mongoose'

export type CollectionDocument = HydratedDocument<Collection>

@Schema({ timestamps: true })
export class Collection {
  @Prop({ required: true, trim: true, index: true })
  title!: string

  @Prop({ required: true, trim: true, unique: true, index: true })
  slug!: string

  @Prop({ default: '' })
  description?: string

  @Prop({ type: Object, default: null })
  cover?: {
    type: 'image' | 'video'
    url: string
    alt?: string
  }

  // порядок важливий:
  @Prop({ type: [mongoose.Schema.Types.ObjectId], ref: 'Case', default: [] })
  cases!: string[]

  @Prop({ type: Boolean, default: false, index: true })
  featured!: boolean

  @Prop({ type: Number, default: 0, index: true })
  order!: number
}

export const CollectionSchema = SchemaFactory.createForClass(Collection)

// корисні індекси для головної та списку
CollectionSchema.index({ featured: 1, order: 1, updatedAt: -1 }, { name: 'idx_featured_collections' })
CollectionSchema.index({ order: 1, updatedAt: -1 }, { name: 'idx_collections_order' })
