import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';


export enum BotTaskType {
  VOTE = 'vote',
  FOLLOW = 'follow',
  LIKE = 'like',
  COMMENT = 'comment'
}


export enum BotTaskPriority {
  HIGH = 'high',
  MEDIUM = 'medium', 
  LOW = 'low'
}

@Schema({ timestamps: true })
export class BotQueue extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Bot', required: true })
  bot: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(BotTaskType) }) 
  actionType: string;

  @Prop({ required: true })
  targetType: string;

  @Prop({ required: true })
  targetId: string;

  @Prop({ required: true })
  scheduledFor: Date;

  @Prop({ default: 'pending' })
  status: string;

  @Prop({ default: 0 })
  attempts: number;

  @Prop()
  lastAttempt: Date;

  @Prop()
  errorMessage: string;

  
  @Prop({ type: Object })
  payload?: any; // Додаткові дані (наприклад, scores для голосування)

  @Prop({ default: BotTaskPriority.MEDIUM, enum: Object.values(BotTaskPriority) }) 
  priority: BotTaskPriority;
}

export const BotQueueSchema = SchemaFactory.createForClass(BotQueue);