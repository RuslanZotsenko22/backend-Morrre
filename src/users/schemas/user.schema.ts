
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
  if (this.isModified('username') && this.username) {
    // @ts-ignore
    this.usernameLower = String(this.username).trim().toLowerCase();
  }
  next();
});

UserSchema.pre('findOneAndUpdate', function (next) {
  const update: any = this.getUpdate() || {};

  const nextUsername =
    update?.username ??
    update?.$set?.username ??
    update?.$set?.['username'];

  if (nextUsername) {
    const normalized = String(nextUsername).trim().toLowerCase();
    if (update.$set) {
      update.$set.usernameLower = normalized;
    } else {
      update.usernameLower = normalized;
    }
    this.setUpdate(update);
  }
  next();
});
