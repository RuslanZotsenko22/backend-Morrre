import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Chat {
  @Prop({ type: [Types.ObjectId], ref: 'User', required: true })
  participants: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Message', default: null })
  lastMessageId: Types.ObjectId | null;

  @Prop([{
    userId: { type: Types.ObjectId, ref: 'User', required: true },
    pinnedAt: { type: Date },
    lastReadAt: { type: Date },
    unreadCount: { type: Number, default: 0 },
    hiddenAt: { type: Date },
  }])
  userMeta: Array<{ userId: Types.ObjectId; pinnedAt?: Date; lastReadAt?: Date; unreadCount: number; hiddenAt?: Date }>;

  
  @Prop() createdAt?: Date;
  @Prop() updatedAt?: Date;
}


export type ChatDocument = HydratedDocument<Chat>;
export const ChatSchema = SchemaFactory.createForClass(Chat);

ChatSchema.index({ participants: 1 });
ChatSchema.index({ 'userMeta.userId': 1 });
ChatSchema.index({ updatedAt: -1 });
