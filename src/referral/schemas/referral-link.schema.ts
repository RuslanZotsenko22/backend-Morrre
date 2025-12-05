import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReferralLinkDocument = ReferralLink & Document;

@Schema({ timestamps: true })
export class ReferralLink {
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  juryId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  usedBy: Types.ObjectId;

  @Prop({ default: false })
  isUsed: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }) // 30 днів
  expiresAt: Date;
}

export const ReferralLinkSchema = SchemaFactory.createForClass(ReferralLink);