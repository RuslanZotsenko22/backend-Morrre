import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ collection: 'user_stats', timestamps: true })
export class UserStats {
  
  @Prop({ type: Types.ObjectId, ref: 'User', unique: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ default: 0 }) votes!: number;
  @Prop({ default: 0 }) followers!: number;
  @Prop({ default: 0 }) views!: number;
  @Prop({ default: 0 }) shots!: number;
  @Prop() lastRecountAt?: Date;
  @Prop({ default: 0 }) rating!: number;

  
  @Prop({ default: 0 }) totalScore!: number;      // загальний рейтинг
  @Prop({ default: 0 }) weeklyScore!: number;     // тижневий рейтинг
  @Prop({ default: 0 }) caseCount!: number;       // кількість кейсів
  @Prop({ default: 0 }) refsLikesTotal!: number;  // сумарно лайків на референсах
  @Prop({ default: 0 }) casesOver7Count!: number; // кейсів з оцінкою ≥ 7
}

export type UserStatsDocument = HydratedDocument<UserStats>;
export const UserStatsSchema = SchemaFactory.createForClass(UserStats);
