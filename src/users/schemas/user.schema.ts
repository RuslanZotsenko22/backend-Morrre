
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

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

  
  @Prop({ lowercase: true, index: true, unique: true, sparse: true })
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

  @Prop({ type: String, enum: ['user', 'admin', 'jury', 'pro'], default: 'user' })
  role: UserRole;

  @Prop({ default: 0 })
  totalUserScore: number;

 
  @Prop({ default: true })
  isActive?: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);


UserSchema.index({ name: 1 });             // пошук/фільтр за іменем
UserSchema.index({ role: 1 });             // швидка фільтрація за роллю (в т.ч. 'pro')
UserSchema.index({ totalUserScore: -1 });  // сортування/ранжування користувачів



UserSchema.pre('save', function (next) {
  // @ts-ignore
  if (this.isModified('username')) {
    // @ts-ignore
    const u = this.username;
    // @ts-ignore
    this.usernameLower = u ? String(u).trim().toLowerCase() : undefined;
  }
  next();
});


UserSchema.pre('findOneAndUpdate', function (next) {
  const update: any = this.getUpdate() || {};
  const $set = update.$set ?? {};
  const $unset = update.$unset ?? {};

  
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

  next();
});