import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FollowDocument = Follow & Document;

@Schema({ timestamps: true })
export class Follow {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  follower: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  following: Types.ObjectId;

  @Prop({ default: false })
  isBot: boolean;

  @Prop()
  createdAt: Date;
}

export const FollowSchema = SchemaFactory.createForClass(Follow);

// Додаємо compound index для унікальності підписки
FollowSchema.index({ follower: 1, following: 1 }, { unique: true });