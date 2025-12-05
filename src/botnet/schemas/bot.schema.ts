import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Bot extends Document {
  @Prop({ required: true, unique: true })
  username: string;

  @Prop()
  avatar: string;

  @Prop({ default: false })
  canVote: boolean;

  @Prop()
  lastActivity: Date;

  @Prop({ default: 0 })
  activityCount: number;

  @Prop({ default: 'active' })
  status: string;

  @Prop({ default: true })
  isBot: boolean;

  @Prop()
  lastVoteAt: Date;

  @Prop({ type: Number, default: 0 })
reactivationCount: number;

@Prop({ type: Date, default: Date.now })
lastHealthCheck: Date;

  // ===== Референси, взяті ботом (для ботнету) =====
  @Prop([{
    referenceId: { type: Types.ObjectId, required: true },
    caseId: { type: Types.ObjectId, ref: 'Case', required: true },
    takenAt: { type: Date, default: Date.now }
  }])
  takenReferences: {
    referenceId: Types.ObjectId;
    caseId: Types.ObjectId;
    takenAt: Date;
  }[];
}

export const BotSchema = SchemaFactory.createForClass(Bot);

// Додаємо індекс для швидкого пошуку взятих референсів
BotSchema.index({ 'takenReferences.caseId': 1 }, { name: 'idx_taken_references_case' });
BotSchema.index({ 'takenReferences.referenceId': 1 }, { name: 'idx_taken_references_ref' });