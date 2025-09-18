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
CaseSchema.index({ title: 'text', tags: 1, categories: 1, industry: 1 });
