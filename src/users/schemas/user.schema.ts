import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type UserDocument = HydratedDocument<User>;
export type UserRole = 'user' | 'admin' | 'jury' | 'pro' | 'bot';
export type UserAuthProvider = 'password' | 'google';

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

  @Prop({ lowercase: true, unique: true, sparse: true })
  usernameLower?: string;

  @Prop()
  avatarUrl?: string;

  @Prop({ default: '' })
  about?: string;

  @Prop({ default: '' })
  location?: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  socials?:
    | {
        behance?: string;
        dribbble?: string;
        instagram?: string;
        linkedin?: string;
        x?: string;
        website?: string;
      }
    | string[];

  @Prop({ type: [String], default: [] })
  industries?: string[];

  @Prop({ type: [String], default: [] })
  whatWeDid?: string[];

  @Prop({ type: String, enum: ['user', 'admin', 'jury', 'pro', 'bot'], default: 'user' })
  role: UserRole;

  @Prop({ default: 0 })
  totalUserScore: number;

  @Prop({ default: true })
  isActive?: boolean;

  // ======== GOOGLE OAUTH ========

  @Prop({ type: String, unique: true, sparse: true })
  googleId?: string;

  @Prop({ type: Boolean, default: false })
  emailVerified?: boolean;

  @Prop({ type: [String], default: [] })
  providers?: UserAuthProvider[];

  // ======== БОТНЕТ ПОЛЯ ========
  
  @Prop({ type: Boolean, default: false })
  isBot?: boolean;

  @Prop({ type: Boolean, default: false })
  botCanVote?: boolean;

  @Prop({ type: Date })
  botLastActivity?: Date;

  @Prop({ type: Number, default: 0 })
  botActivityCount?: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Bot', default: null })
  botData?: string;

  @Prop({ type: String })
  botAvatarId?: string;

  @Prop({ type: Boolean, default: false })
  botHasAvatar?: boolean;

  @Prop({ type: Date })
  botCreatedAt?: Date;

  @Prop({ type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' })
  botStatus?: string;

  @Prop({ type: Number, default: 0 })
  botVotesCount?: number;

  @Prop({ type: Number, default: 0 })
  botLikesCount?: number;

  @Prop({ type: Number, default: 0 })
  botCommentsCount?: number;

  @Prop({ type: Number, default: 0 })
  botFollowsCount?: number;

  @Prop({ type: Number, default: 0 })
  botReferencesTaken?: number;

  @Prop({ type: Date })
  botLastVoteDate?: Date;

  @Prop({ type: String })
  botGenerationGroup?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Базові індекси
UserSchema.index({ name: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ totalUserScore: -1 });

// Індекси для ботів - додаємо тут, щоб уникнути дублювання з @Prop
UserSchema.index({ isBot: 1 });
UserSchema.index({ botStatus: 1 });
UserSchema.index({ botCanVote: 1 });
UserSchema.index({ botHasAvatar: 1 });

// --- hooks ---
UserSchema.pre('save', function (next) {
  const user = this as any;
  
  // Нормалізація username
  if (user.isModified('username')) {
    const u = user.username;
    user.usernameLower = u ? String(u).trim().toLowerCase() : undefined;
  }

  // Нормалізація email
  if (user.isModified('email') && typeof user.email === 'string') {
    user.email = user.email.trim().toLowerCase();
  }

  // Якщо користувач є ботом, автоматично встановлюємо роль 'bot'
  if (user.isBot && user.role !== 'bot') {
    user.role = 'bot';
  }

  // Якщо роль змінюється на 'bot', автоматично встановлюємо isBot = true
  if (user.isModified('role') && user.role === 'bot' && !user.isBot) {
    user.isBot = true;
  }

  // Якщо це новий бот, встановлюємо дату створення
  if (user.isNew && user.isBot && !user.botCreatedAt) {
    user.botCreatedAt = new Date();
  }

  // Оновлюємо лічильник активності, якщо змінюється botLastActivity
  if (user.isModified('botLastActivity')) {
    if (!user.botActivityCount) {
      user.botActivityCount = 0;
    }
  }

  next();
});

UserSchema.pre('findOneAndUpdate', function (next) {
  const update: any = this.getUpdate() || {};
  const $set = update.$set ?? {};
  const $unset = update.$unset ?? {};

  // нормалізація usernameLower
  const nextUsername =
    (Object.prototype.hasOwnProperty.call(update, 'username') ? update.username : undefined) ??
    (Object.prototype.hasOwnProperty.call($set, 'username') ? $set.username : undefined);

  if ($unset && ($unset.username || $unset['username'])) {
    update.$unset = { ...$unset, usernameLower: 1 };
    this.setUpdate(update);
    return next();
  }

  if (typeof nextUsername !== 'undefined') {
    const normalized = nextUsername ? String(nextUsername).trim().toLowerCase() : undefined;

    if (!update.$set) update.$set = {};
    update.$set.usernameLower = normalized;

    if (!nextUsername) {
      delete update.$set.username;
      delete update.$set.usernameLower;
      update.$unset = { ...(update.$unset || {}), username: 1, usernameLower: 1 };
    }
    this.setUpdate(update);
  }

  // нормалізація email
  const nextEmail =
    (Object.prototype.hasOwnProperty.call(update, 'email') ? update.email : undefined) ??
    (Object.prototype.hasOwnProperty.call($set, 'email') ? $set.email : undefined);

  if (typeof nextEmail !== 'undefined') {
    const normalizedEmail = nextEmail ? String(nextEmail).trim().toLowerCase() : nextEmail;
    if (!update.$set) update.$set = {};
    update.$set.email = normalizedEmail;
    this.setUpdate(update);
  }

  // Якщо встановлюється роль 'bot', автоматично встановлюємо isBot = true
  if ((update.role === 'bot' || $set.role === 'bot') && !update.isBot && !$set.isBot) {
    if (!update.$set) update.$set = {};
    update.$set.isBot = true;
    this.setUpdate(update);
  }

  // Якщо встановлюється isBot = true, автоматично встановлюємо роль 'bot'
  if ((update.isBot === true || $set.isBot === true) && !update.role && !$set.role) {
    if (!update.$set) update.$set = {};
    update.$set.role = 'bot';
    this.setUpdate(update);
  }

  next();
});