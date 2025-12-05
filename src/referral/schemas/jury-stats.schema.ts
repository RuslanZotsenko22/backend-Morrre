import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type JuryStatsDocument = JuryStats & Document;

@Schema({ timestamps: true })
export class JuryStats {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  juryId: Types.ObjectId;

  @Prop({ default: 2 })
  availableLinks: number;

  @Prop({ default: 0 })
  usedLinks: number;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const JuryStatsSchema = SchemaFactory.createForClass(JuryStats);