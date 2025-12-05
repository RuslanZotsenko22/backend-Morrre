import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  recipient: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actor: Types.ObjectId;

  @Prop({ 
    required: true, 
    enum: [
      'LIKE_CASE', 
      'LIKE_REFERENCE', 
      'FOLLOW', 
      'COMMENT', 
      'VOTE', 
      'REFERENCE_TAKEN'
    ] 
  })
  type: string;

  @Prop({ type: Object })
  metadata: {
    caseId?: Types.ObjectId;
    referenceId?: Types.ObjectId;
    commentId?: Types.ObjectId;
    voteScore?: number;
  };

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);