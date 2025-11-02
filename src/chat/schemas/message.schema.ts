import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

type MediaItem = {
  publicId: string;
  url: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
};

class EditedMeta {
  @Prop({ type: Boolean, default: false })
  isEdited: boolean;

  @Prop({ type: Date, default: null })
  at?: Date | null;

  @Prop({ type: Number, default: 0 })
  count: number;
}

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Chat', required: true })
  chatId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  from: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  to: Types.ObjectId;

  @Prop({ type: String, enum: ['text', 'media', 'template'], required: true })
  type: 'text' | 'media' | 'template';

  @Prop() text?: string;

  @Prop([
    {
      publicId: String,
      url: String,
      mime: String,
      size: Number,
      width: Number,
      height: Number,
    },
  ])
  media?: MediaItem[];

  @Prop() templateKey?: string;

  
  @Prop({ type: EditedMeta, default: () => ({}) })
  edited: EditedMeta;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  deletedFor: Types.ObjectId[];

  @Prop({ type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' })
  status: 'sent' | 'delivered' | 'read';

@Prop({ type: Object, default: null })
meta?: Record<string, any> | null;


  @Prop() createdAt?: Date;
  @Prop() updatedAt?: Date;
}

export type MessageDocument = HydratedDocument<Message>;
export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ chatId: 1, createdAt: -1 });
MessageSchema.index({ from: 1, to: 1, createdAt: -1 });
MessageSchema.index({ text: 'text' });
