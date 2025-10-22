import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PopularQueueDocument = HydratedDocument<PopularQueue>;

export type PopularQueueStatus = 'queued' | 'published';

@Schema({ collection: 'popular_queue', timestamps: true })
export class PopularQueue {
  @Prop({ type: Types.ObjectId, ref: 'Case', required: true, index: true })
  caseId: Types.ObjectId;

  @Prop({ type: String, enum: ['queued', 'published'], default: 'queued', index: true })
  status: PopularQueueStatus;

  @Prop({ type: Boolean, default: false })
  forceToday: boolean;

  @Prop({ type: Date, default: Date.now })
  addedAt: Date;

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;
}

export const PopularQueueSchema = SchemaFactory.createForClass(PopularQueue);
