import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CommentDocument = Comment & Document;

@Schema({ timestamps: true })
export class Comment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ required: true })
  targetId: string;

  @Prop({ required: true, enum: ['case', 'reference'] })
  targetType: string;

  @Prop({ required: true })
  text: string;

  @Prop({ default: false })
  isBot: boolean;

  @Prop()
  createdAt: Date;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);