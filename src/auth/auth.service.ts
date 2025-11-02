import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import Redis from 'ioredis';

@Injectable()
export class AuthService {
  constructor(private users: UsersService, private jwt: JwtService) {}

  // ========= REDIS & MAILER SETUP =========
  private redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  private OTP_TTL_MIN = Number(process.env.OTP_TTL_MIN ?? 10);
  private VERIFY_TOKEN_TTL_MIN = Number(process.env.VERIFY_TOKEN_TTL_MIN ?? 15);
  private OTP_ATTEMPT_LIMIT = Number(process.env.OTP_ATTEMPT_LIMIT ?? 5);

  // ========= OTP FLOW (email → code → complete-register) =========

  async requestCode(email: string) {
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const code = this.generateOtp(); 
    const codeHash = await bcrypt.hash(code, 10);

    const otpKey = this.otpKey(email);
    const payload = JSON.stringify({
      email,
      codeHash,
      attempts: 0,
      expiresAt: Date.now() + this.OTP_TTL_MIN * 60_000,
    });
    await this.redis.set(otpKey, payload, 'EX', this.OTP_TTL_MIN * 60);

    await this.sendOtpEmail(email, code);
    return { ok: true };
  }

  async verifyCode(email: string, code: string) {
    const otpKey = this.otpKey(email);
    const raw = await this.redis.get(otpKey);
    if (!raw) throw new BadRequestException('Invalid or expired code');

    const rec = JSON.parse(raw) as {
      email: string;
      codeHash: string;
      attempts: number;
      expiresAt: number;
    };

    if (rec.attempts >= this.OTP_ATTEMPT_LIMIT) {
      throw new BadRequestException('Too many attempts. Try later.');
    }

    const ok = await bcrypt.compare(code, rec.codeHash);
    if (!ok) {
      rec.attempts += 1;
      await this.redis.set(otpKey, JSON.stringify(rec), 'EX', this.remainingTtlSeconds(rec.expiresAt));
      throw new BadRequestException('Invalid or expired code');
    }

    const token = crypto.randomBytes(24).toString('hex');
    const tokenKey = this.tokenKey(token);
    const tokenPayload = JSON.stringify({
      email,
      issuedAt: Date.now(),
      tokenExpiresAt: Date.now() + this.VERIFY_TOKEN_TTL_MIN * 60_000,
    });
    await this.redis.set(tokenKey, tokenPayload, 'EX', this.VERIFY_TOKEN_TTL_MIN * 60);

    await this.redis.del(otpKey);

    return { token };
  }

  async completeRegister(dto: { token: string; username: string; name: string; password: string }) {
    const tokenKey = this.tokenKey(dto.token);
    const raw = await this.redis.get(tokenKey);
    if (!raw) throw new BadRequestException('Invalid or expired token');

    const rec = JSON.parse(raw) as { email: string; issuedAt: number; tokenExpiresAt: number };
    if (!rec.email || rec.tokenExpiresAt < Date.now()) {
      await this.redis.del(tokenKey);
      throw new BadRequestException('Invalid or expired token');
    }

    const email = rec.email;

    const exists = await this.users.findByEmail(email);
    if (exists) throw new BadRequestException('Email already in use');

    if (typeof (this.users as any).findByUsername === 'function') {
      const usernameTaken = await (this.users as any).findByUsername(dto.username);
      if (usernameTaken) throw new BadRequestException('Username already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.create({
      email,
      name: dto.name,
      username: dto.username,
      passwordHash,
    });

    await this.redis.del(tokenKey);

    const tokens = await this.issueTokens((user as any)._id ?? (user as any).id);
    return { user: this.users.publicUser ? this.users.publicUser(user as any) : user, ...tokens };
  }

  // ========= LEGACY =========

  async register(dto: { email: string; name: string; password: string }) {
    const exists = await this.users.findByEmail(dto.email);
    if (exists) throw new BadRequestException('Email already in use');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.create({ email: dto.email, name: dto.name, passwordHash });
    const tokens = await this.issueTokens((user as any)._id ?? (user as any).id);
    return { user, ...tokens };
  }

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email, true);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, (user as any).passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    const tokens = await this.issueTokens((user as any)._id ?? (user as any).id);
    return { user: this.users.publicUser(user as any), ...tokens };
  }

  async issueTokens(userId: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: process.env.JWT_ACCESS_TTL || '15m' },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, typ: 'refresh' },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: process.env.JWT_REFRESH_TTL || '30d' },
    );
    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
      if (payload?.typ !== 'refresh') throw new Error('wrong token type');
      return this.issueTokens(payload.sub);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // ========= helpers =========

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private otpKey(email: string) {
    return `otp:${email.toLowerCase()}`;
  }

  private tokenKey(token: string) {
    return `otp_token:${token}`;
  }

  // --- Reset-password Redis keys ---
  private resetOtpKey(email: string) {
    return `reset:otp:${email.toLowerCase()}`;
  }
  private resetTokenKey(token: string) {
    return `reset:token:${token}`;
  }

  private remainingTtlSeconds(expiresAtMs: number) {
    const left = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
    return left || 1;
  }

  private async sendOtpEmail(email: string, code: string) {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return;

    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM || 'no-reply@example.com',
        to: email,
        subject: 'Код підтвердження',
        text: `Ваш код: ${code}. Дійсний ${this.OTP_TTL_MIN} хв.`,
        html: `<p>Ваш код: <b>${code}</b>. Дійсний ${this.OTP_TTL_MIN} хв.</p>`,
      });
    } catch {
      // no-op
    }
  }

  // ========= Password Reset (Redis-based) =========

  async requestPasswordReset(email: string) {
    try {
      const code = this.generateOtp();
      const codeHash = await bcrypt.hash(code, 10);

      const key = this.resetOtpKey(email);
      const ttlSec = 10 * 60;

      const payload = JSON.stringify({
        email,
        codeHash,
        attempts: 0,
        expiresAt: Date.now() + ttlSec * 1000,
      });

      await this.redis.set(key, payload, 'EX', ttlSec);
      await this.sendOtpEmail(email, code);
      return { ok: true };
    } catch {
      return { ok: true };
    }
  }

  async verifyPasswordReset(email: string, code: string) {
    const key = this.resetOtpKey(email);
    const raw = await this.redis.get(key);
    if (!raw) throw new BadRequestException('INVALID_CODE');

    const rec = JSON.parse(raw) as {
      email: string;
      codeHash: string;
      attempts: number;
      expiresAt: number;
    };

    if (rec.attempts >= this.OTP_ATTEMPT_LIMIT) {
      throw new BadRequestException('Too many attempts. Try later.');
    }

    const ok = await bcrypt.compare(code, rec.codeHash);
    if (!ok) {
      rec.attempts += 1;
      const leftSec = this.remainingTtlSeconds(rec.expiresAt);
      await this.redis.set(key, JSON.stringify(rec), 'EX', leftSec);
      throw new BadRequestException('INVALID_CODE');
    }

    await this.redis.del(key);

    const resetToken = crypto.randomBytes(24).toString('hex');
    const tokenKey = this.resetTokenKey(resetToken);
    const tokenTtl = 15 * 60;

    await this.redis.set(
      tokenKey,
      JSON.stringify({ email, tokenIssuedAt: Date.now() }),
      'EX',
      tokenTtl,
    );

    return { resetToken };
  }

  async completePasswordReset(resetToken: string, newPassword: string) {
    if (!resetToken || !newPassword) {
      throw new BadRequestException('TOKEN_AND_PASSWORD_REQUIRED');
    }

    const tokenKey = this.resetTokenKey(resetToken);
    const raw = await this.redis.get(tokenKey);
    if (!raw) throw new BadRequestException('INVALID_OR_EXPIRED_TOKEN');

    await this.redis.del(tokenKey);

    const rec = JSON.parse(raw) as { email: string; tokenIssuedAt: number };
    const email = rec?.email;
    if (!email) throw new BadRequestException('INVALID_OR_EXPIRED_TOKEN');

    const user = await this.users.findByEmail(email, true);
    if (!user) return { ok: true };

    const hashed = await bcrypt.hash(newPassword, 10);
    (user as any).passwordHash = hashed;
    await (user as any).save();

    return { ok: true };
  }

  // ========= GOOGLE OAUTH / ONE-TAP =========

  async loginWithGoogle(p: {
    googleId: string;
    email: string | null;
    emailVerified?: boolean;
    name?: string | null;
    avatar?: string | null;
  }) {
    const email = p.email ? p.email.trim().toLowerCase() : null;

    let user =
      typeof (this.users as any).findOne === 'function'
        ? await (this.users as any).findOne({ googleId: p.googleId })
        : await (this.users as any)['userModel']?.findOne?.({ googleId: p.googleId }).exec?.();

    
    if (!user && email) {
      const byEmail = await this.users.findByEmail(email);
      if (byEmail) {
        if (!(byEmail as any).googleId) (byEmail as any).googleId = p.googleId;
        if (p.emailVerified === true) (byEmail as any).emailVerified = true;
        if (!(byEmail as any).avatarUrl && p.avatar) (byEmail as any).avatarUrl = p.avatar;
        if (!(byEmail as any).name && p.name) (byEmail as any).name = p.name;

        if (typeof (byEmail as any).save === 'function') {
          user = await (byEmail as any).save();
        } else if (typeof (this.users as any).updateById === 'function') {
          user = await (this.users as any).updateById((byEmail as any)._id, byEmail);
        } else if ((this.users as any)['userModel']?.findByIdAndUpdate) {
          user = await (this.users as any)['userModel']
            .findByIdAndUpdate((byEmail as any)._id, byEmail, { new: true })
            .exec();
        } else {
          user = byEmail;
        }
      }
    }

    
    if (!user) {
      if (!email) throw new BadRequestException('Google did not return email');
      const payload: any = {
        email,
        name: p.name || 'User',
        avatarUrl: p.avatar || undefined,
        googleId: p.googleId,
        emailVerified: p.emailVerified ?? true,
      };

      if (typeof (this.users as any).createFromOAuth === 'function') {
        user = await (this.users as any).createFromOAuth(payload);
      } else if (typeof (this.users as any).create === 'function') {
        user = await (this.users as any).create(payload);
      } else if ((this.users as any)['userModel']) {
        const Model = (this.users as any)['userModel'];
        user = await new Model(payload).save();
      } else {
        throw new BadRequestException('UsersService has no create method');
      }
    }

    // 4) видаємо JWT
    const userId = (user as any)._id ?? (user as any).id;
    const tokens = await this.issueTokens(userId);

    const safeUser =
      typeof (this.users as any).publicUser === 'function'
        ? (this.users as any).publicUser(user)
        : user;

    return { user: safeUser, ...tokens };
  }

  async publicUserByEmail(email: string) {
    const u = await this.users.findByEmail(email.toLowerCase());
    return typeof (this.users as any).publicUser === 'function'
      ? (this.users as any).publicUser(u)
      : u;
  }
}
