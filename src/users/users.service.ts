import { Injectable, NotFoundException, ConflictException, BadRequestException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { Model, FilterQuery } from 'mongoose';
import * as bcrypt from 'bcryptjs';

import { MediaService } from '../media/media.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Optional() private readonly media?: MediaService,
    @Optional() private readonly cloudinary?: { upload: (file: Express.Multer.File, opts?: any) => Promise<any> },
  ) {}

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
      const u = await this.userModel.findByIdAndUpdate(id, patch, { new: true, runValidators: true });
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
      throw new BadRequestException('oldPassword and newPassword are required');
    }

    // passwordHash має select:false у схемі → додаємо вручну
    const user = await this.userModel.findById(userId).select('+passwordHash');
    if (!user) throw new NotFoundException('User not found');

    const ok = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('OLD_PASSWORD_INCORRECT');

    const saltRounds = 10;
    user.passwordHash = await bcrypt.hash(newPassword, saltRounds);
    await user.save();

    return { ok: true };
  }

  // ---------- Username helpers ----------
  private escapeRegex(input: string) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async findByUsername(username: string) {
    if (!username) return null;
    const u = String(username).trim();
    if (!u) return null;
    const uLower = u.toLowerCase();

    // шукаємо або по нормалізованому полю, або по старому `username` (case-insensitive)
    return this.userModel.findOne({
      $or: [
        { usernameLower: uLower },
        { username: { $regex: `^${this.escapeRegex(u)}$`, $options: 'i' } },
      ],
    });
  }

  async isUsernameAvailable(u: string, excludeId?: string) {
    const username = u?.trim();
    if (!username || username.length < 3) return false;

    const uLower = username.toLowerCase();

    const found = await this.userModel.findOne({
      $and: [
        {
          $or: [
            { usernameLower: uLower },
            { username: { $regex: `^${this.escapeRegex(username)}$`, $options: 'i' } },
          ],
        },
        ...(excludeId ? [{ _id: { $ne: excludeId } }] : []),
      ],
    }).lean();

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

    // спочатку пробуємо cloudinary, потім локальний media
    const uploader =
      this.cloudinary?.upload ||
      this.media?.upload;

    if (!uploader) {
      // зберігаємо твоє повідомлення про відсутність провайдера
      throw new Error('Uploader is not wired: expected cloudinary.upload(file) or media.upload(file)');
    }

    const res = await uploader(file, { folder: 'avatars' }); // папка узагальнена
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
async searchPublicUsers(params: { search?: string; limit?: number; offset?: number }) {
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const offset = Math.max(0, Number(params.offset) || 0);
    const search = (params.search || '').trim();

    const filter: FilterQuery<UserDocument> = {
      // показуємо тільки активних
      isActive: { $ne: false },
      // не показуємо ботів
      role: { $ne: 'bot' },
    };

    if (search) {
      const regex = new RegExp(this.escapeRegex(search), 'i');
      (filter as any).$or = [
        { name: regex },
        { username: regex },
        { email: regex },
      ];
    }

    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ totalUserScore: -1, createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .select('name username avatarUrl role totalUserScore industries whatWeDid location')
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    return {
      items: items.map((u: any) => ({
        id: u._id.toString(),
        name: u.name,
        username: u.username ?? null,
        avatarUrl: u.avatarUrl ?? null,
        role: u.role,
        totalUserScore: u.totalUserScore ?? 0,
        industries: u.industries ?? [],
        whatWeDid: u.whatWeDid ?? [],
        location: u.location ?? '',
      })),
      total,
      limit,
      offset,
    };
  }
  // ---------- THIN HELPERS for OAuth (НЕ ламають існуючу логіку) ----------

  /**
   * Тонка обгортка над моделлю. Повертає "сирий" документ (НЕ publicUser),
   * щоб сервіси авторизації могли оновити його та зберегти.
   */
  async findOne(filter: FilterQuery<UserDocument>) {
    return this.userModel.findOne(filter).exec();
  }

  /**
   * Оновлює документ за id. Повертає оновлений "сирий" документ.
   * Використовується для акуратного лінкування googleId / avatar / name тощо.
   */
  async updateById(id: string, patch: Partial<User>) {
    return this.userModel.findByIdAndUpdate(id, patch, { new: true }).exec();
  }

  /**
   * Створює нового користувача з OAuth-джерела.
   * Повертає "сирий" документ, щоб авторизація могла одразу видати токени.
   */
  async createFromOAuth(data: Partial<User>) {
    // не чіпаємо normalizeUsernamePair тут, бо username може бути відсутній
    const doc = new this.userModel(data);
    return doc.save();
  }
}
