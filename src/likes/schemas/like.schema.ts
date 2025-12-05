import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LikeDocument = Like & Document;

@Schema({ timestamps: true })
export class Like {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ required: true })
  targetId: string;

  @Prop({ required: true, enum: ['case', 'reference'] })
  targetType: string;

  @Prop({ default: false })
  isBot: boolean;

  @Prop()
  createdAt: Date;
}

export const LikeSchema = SchemaFactory.createForClass(Like);