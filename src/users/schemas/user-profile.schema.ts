// src/users/schemas/user-profile.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ _id: false })
class Socials {
  @Prop() behance?: string;
  @Prop() dribbble?: string;
  @Prop() instagram?: string;
  @Prop() linkedin?: string;
  @Prop() x?: string;
  @Prop() website?: string;
}

@Schema({ collection: 'user_profiles', timestamps: true })
export class UserProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  userId!: Types.ObjectId;

  @Prop()
  displayName?: string;

  @Prop()
  avatarUrl?: string;

  @Prop()
  location?: string;

  @Prop()
  about?: string;

  @Prop()
  industry?: string;

  @Prop({ type: [String], default: [] })
  whatWeDid?: string[];

  @Prop({ type: Socials })
  socials?: Socials;

  @Prop({ type: [Types.ObjectId], default: [] })
  caseOrder?: Types.ObjectId[];

  @Prop({ type: Date, default: () => new Date() })
  memberSince!: Date;
}

export const UserProfileSchema = SchemaFactory.createForClass(UserProfile);


UserProfileSchema.index({ displayName: 1 }); // пошук по імені
UserProfileSchema.index({ industry: 1 });    // фільтр по індустрії
UserProfileSchema.index({ location: 1 });    // фільтр по локації
