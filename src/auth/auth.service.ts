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

  /** 1) Надіслати код на email */
  async requestCode(email: string) {
    const code = this.generateOtp(); // 6 цифр
    const codeHash = await bcrypt.hash(code, 10);

    // Зберігаємо в Redis одним JSON об'єктом + TTL
    const otpKey = this.otpKey(email);
    const payload = JSON.stringify({
      email,
      codeHash,
      attempts: 0,
      // зручна дубляжна дата закінчення (для дебагу), TTL все одно керує Redis
      expiresAt: Date.now() + this.OTP_TTL_MIN * 60_000,
    });
    await this.redis.set(otpKey, payload, 'EX', this.OTP_TTL_MIN * 60);

    await this.sendOtpEmail(email, code); // якщо SMTP не налаштовано — тихо пропустимо
    // console.log(`[DEV] OTP for ${email}: ${code}`);
    return { ok: true };
  }

  /** 2) Перевірити код і видати одноразовий токен */
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

    // Код валідний → видаємо одноразовий токен, який front передасть у complete-register
    const token = crypto.randomBytes(24).toString('hex');
    const tokenKey = this.tokenKey(token);
    const tokenPayload = JSON.stringify({
      email,
      issuedAt: Date.now(),
      tokenExpiresAt: Date.now() + this.VERIFY_TOKEN_TTL_MIN * 60_000,
    });
    await this.redis.set(tokenKey, tokenPayload, 'EX', this.VERIFY_TOKEN_TTL_MIN * 60);

    // Інвалідовуємо OTP (щоб не можна було повторно верифікувати)
    await this.redis.del(otpKey);

    return { token };
  }

  /** 3) Завершити реєстрацію (token + username, name, password) */
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

    // Перевірки унікальності
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

    // Інвалідовуємо одноразовий токен
    await this.redis.del(tokenKey);

    const tokens = await this.issueTokens((user as any)._id ?? (user as any).id);
    return { user: this.users.publicUser ? this.users.publicUser(user as any) : user, ...tokens };
  }

  // ========= LEGACY/ІСНУЮЧИЙ ФЛОУ (не чіпав) =========

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
    // 6-значний з лідируючими нулями
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private otpKey(email: string) {
    return `otp:${email.toLowerCase()}`;
  }

  private tokenKey(token: string) {
    return `otp_token:${token}`;
  }

  /** Повертає залишок TTL у секундах для перезапису ключа без продовження життя */
  private remainingTtlSeconds(expiresAtMs: number) {
    const left = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
    return left || 1;
  }

  private async sendOtpEmail(email: string, code: string) {
    // Якщо SMTP не налаштований — тихо скіпаємо
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
      // Не валимо флоу, але в реалі краще логувати
    }
  }
}
