
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  publicUser(u: any) {
    if (!u) return null;
    const plain = typeof u.toObject === 'function' ? u.toObject() : u;
    const { passwordHash, ...rest } = plain;
    return rest;
  }

  
  private normalizeUsernamePair(patch: Partial<User>) {
    if (typeof patch?.username === 'string') {
      const raw = patch.username.trim();
      patch.username = raw || undefined; 
      (patch as any).usernameLower = raw ? raw.toLowerCase() : undefined;
    }
    return patch;
  }

  async getMe(userId: string) {
    const u = await this.userModel
      .findById(userId)
      .select('name username avatarUrl about location totalUserScore industries whatWeDid socials role email');
    if (!u) throw new NotFoundException('User not found');
    return this.publicUser(u);
  }

  async findByIdPublic(id: string) {
    const u = await this.userModel.findById(id);
    if (!u) throw new NotFoundException('User not found');
    return this.publicUser(u);
  }

  async updateProfile(id: string, patch: Partial<User>) {
    try {
      this.normalizeUsernamePair(patch);
      const u = await this.userModel.findByIdAndUpdate(id, patch, { new: true });
      if (!u) throw new NotFoundException('User not found');
      return this.publicUser(u);
    } catch (err: any) {
      // дубль унікального індексу по ніку
      if (err?.code === 11000 && (err?.keyPattern?.usernameLower || err?.keyValue?.usernameLower)) {
        throw new ConflictException('USERNAME_TAKEN');
      }
      throw err;
    }
  }

  async findByEmail(email: string, withPassword = false) {
    const q = this.userModel.findOne({ email });
    return withPassword ? q.select('+passwordHash') : q;
  }

  async create(data: Partial<User>) {
    try {
      this.normalizeUsernamePair(data);
      const u = await this.userModel.create(data);
      return this.publicUser(u);
    } catch (err: any) {
      if (err?.code === 11000 && (err?.keyPattern?.usernameLower || err?.keyValue?.usernameLower)) {
        throw new ConflictException('USERNAME_TAKEN');
      }
      throw err;
    }
  }

  // ---------- Password change (bcryptjs) ----------
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    if (!oldPassword || !newPassword) {
      throw new Error('oldPassword and newPassword are required');
    }

    // passwordHash має select:false у схемі → додаємо вручну
    const user = await this.userModel.findById(userId).select('+passwordHash');
    if (!user) throw new NotFoundException('User not found');

    const ok = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!ok) throw new Error('Old password is incorrect');

    const saltRounds = 10;
    user.passwordHash = await bcrypt.hash(newPassword, saltRounds);
    await user.save();

    return { ok: true };
  }

  // ---------- Username helpers ----------
  async findByUsername(username: string) {
    if (!username) return null;
    const usernameLower = String(username).trim().toLowerCase();
    if (!usernameLower) return null;
    return this.userModel.findOne({ usernameLower });
  }

  async isUsernameAvailable(u: string, excludeId?: string) {
    const username = u?.trim();
    if (!username || username.length < 3) return false;

    const usernameLower = username.toLowerCase();
    const found = await this.userModel
      .findOne({
        usernameLower,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
      .lean();

    return !found;
  }

  // ---------- Public profile by username ----------
  async getPublicProfileByUsername(username: string) {
    const user = await this.userModel
      .findOne({
        usernameLower: String(username || '').trim().toLowerCase(),
      })
      .select('name username avatarUrl about location totalUserScore industries whatWeDid socials role')
      .lean();

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // ---------- Avatar upload ----------
  async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!file) throw new Error('File is required');

    const uploader =
      (this as any).cloudinary?.upload ||
      (this as any).media?.upload;

    if (!uploader) {
      throw new Error('Uploader is not wired: expected cloudinary.upload(file) or media.upload(file)');
    }

    const res = await uploader(file, { folder: 'morrre/avatars' });
    const url = res?.secure_url || res?.url;
    if (!url) {
      throw new Error('Upload failed: no URL returned from uploader');
    }

    await this.userModel.updateOne({ _id: userId }, { $set: { avatarUrl: url } });
    return { avatarUrl: url };
  }

  // ---------- Soft delete ----------
  async softDelete(userId: string) {
    const u = await this.userModel.findById(userId);
    if (!u) throw new NotFoundException('User not found');

    await this.userModel.updateOne(
      { _id: userId },
      {
        $set: {
          isActive: false,
          about: '',
          location: '',
          socials: {},
          // avatarUrl: undefined, 
        },
      },
    );

    return { ok: true };
  }
}
