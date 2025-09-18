import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { Model } from 'mongoose';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

publicUser(u: any) {
  if (!u) return null;
  const plain = typeof u.toObject === 'function' ? u.toObject() : u;
  const { passwordHash, ...rest } = plain;
  return rest;
}

  async findByIdPublic(id: string) {
    const u = await this.userModel.findById(id);
    if (!u) throw new NotFoundException('User not found');
    return this.publicUser(u);
  }

  async updateProfile(id: string, patch: Partial<User>) {
    const u = await this.userModel.findByIdAndUpdate(id, patch, { new: true });
    if (!u) throw new NotFoundException('User not found');
    return this.publicUser(u);
  }

  async findByEmail(email: string, withPassword = false) {
    const q = this.userModel.findOne({ email });
    return withPassword ? q.select('+passwordHash') : q;
  }

  async create(data: Partial<User>) {
    const u = await this.userModel.create(data);
    return this.publicUser(u);
  }
}
