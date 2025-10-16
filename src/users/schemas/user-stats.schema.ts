import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ collection: 'user_stats', timestamps: true })
export class UserStats {
  @Prop({ type: Types.ObjectId, ref: 'User', unique: true, index: true }) userId!: Types.ObjectId;
  @Prop({ default: 0 }) votes!: number;
  @Prop({ default: 0 }) followers!: number;
  @Prop({ default: 0 }) views!: number;
  @Prop({ default: 0 }) shots!: number;
  @Prop() lastRecountAt?: Date;

   @Prop({ default: 0 }) rating!: number;
}
export const UserStatsSchema = SchemaFactory.createForClass(UserStats);
