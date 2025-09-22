import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';

export type CaseDocument = HydratedDocument<Case>;

@Schema({ timestamps: true })
export class Case {
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) description?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true })
  ownerId: string;

  @Prop({ type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] })
  contributors: string[];

  @Prop({ type: [String], default: [] }) categories: string[]; // ≤3
  @Prop({ type: String }) industry?: string; // 1
  @Prop({ type: [String], default: [] }) tags: string[]; // ≤20

  @Prop({ type: Object, default: null })
  cover?: { url: string; type: 'image'; sizes?: { low?: string; mid?: string; full?: string } };

  @Prop({ type: [Object], default: [] })
  videos?: { vimeoId?: string; status: 'queued'|'uploading'|'processing'|'ready'|'failed'; playbackUrl?: string; thumbnailUrl?: string }[];

  @Prop({ enum: ['draft','published'], default: 'draft', index: true })
  status: 'draft' | 'published';
}
export const CaseSchema = SchemaFactory.createForClass(Case);

// Текстовий індекс — тільки по рядках
CaseSchema.index(
  { title: 'text', description: 'text' },
  { weights: { title: 5, description: 1 }, name: 'text_title_description' }
);

// Звичайні індекси для фільтрації
CaseSchema.index({ tags: 1 }, { name: 'idx_tags' });
CaseSchema.index({ categories: 1 }, { name: 'idx_categories' });
CaseSchema.index({ industry: 1 }, { name: 'idx_industry' });

