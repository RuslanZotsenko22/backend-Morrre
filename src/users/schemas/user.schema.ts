
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;
export type UserRole = 'user' | 'admin' | 'jury' | 'pro';

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ unique: true, required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ select: false })
  passwordHash: string;

  @Prop({ trim: true, unique: true, sparse: true })
  username?: string;

  @Prop()
  avatarUrl?: string;

  @Prop({ default: '' })
  about?: string;

  @Prop({ default: '' })
  location?: string;

  @Prop({ type: [String], default: [] })
  socials?: string[];

  @Prop({ type: String, enum: ['user', 'admin', 'jury', 'pro'], default: 'user' })
  role: UserRole;

  @Prop({ default: 0 })
  totalUserScore: number;
}

export const UserSchema = SchemaFactory.createForClass(User);

/**
 * INDEXES
 * Примітка: індекси на email і username вже створюються завдяки @Prop({ unique: true }),
 * тому тут їх НЕ дублюємо, щоб уникнути попереджень Mongoose.
 */
UserSchema.index({ name: 1 });             // пошук/фільтр за іменем
UserSchema.index({ role: 1 });             // швидка фільтрація за роллю (в т.ч. 'pro')
UserSchema.index({ totalUserScore: -1 });  // сортування/ранжування користувачів

// (опціонально) комбінований для списків "pro" з рейтингом:
// UserSchema.index({ role: 1, totalUserScore: -1 });
