import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private users: UsersService, private jwt: JwtService) {}

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
}
