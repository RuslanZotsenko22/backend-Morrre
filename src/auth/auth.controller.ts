import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
  import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestCodeDto } from './dto/request-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { CompleteRegisterDto } from './dto/complete-register.dto';
import { GoogleAuthGuard } from './guards/google.guard';

import type { Response } from 'express';
import { OAuth2Client } from 'google-auth-library';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ========= OTP / PASSWORD / LEGACY =========

  @Post('request-code')
  requestCode(@Body() dto: RequestCodeDto) {
    return this.auth.requestCode(dto.email);
  }

  @Post('verify-code')
  verifyCode(@Body() dto: VerifyCodeDto) {
    return this.auth.verifyCode(dto.email, dto.code);
  }

  @Post('complete-register')
  completeRegister(@Body() dto: CompleteRegisterDto) {
    return this.auth.completeRegister(dto);
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  // ГІБРИД: читаємо refreshToken з cookie або з body (зворотно сумісно)
  @Post('refresh')
  refresh(@Req() req: any, @Body() body: { refreshToken?: string }) {
    const rt = req?.cookies?.refreshToken || body?.refreshToken;
    if (!rt) throw new BadRequestException('refreshToken is required');
    return this.auth.refresh(rt);
  }

  @Post('logout')
  logout(@Res() res: Response) {
    // Стираємо refresh-куку; якщо ти робиш whitelist/rotate — тут же можеш її деактивувати
    res.clearCookie('refreshToken', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return res.json({ ok: true });
  }

  @Post('reset-password/request')
  requestPasswordReset(@Body() body: { email: string }) {
    const svc: any = this.auth as any;
    if (typeof svc.requestPasswordReset === 'function') {
      return svc.requestPasswordReset(body.email);
    }
    return this.auth.requestCode(body.email);
  }

  @Post('reset-password/verify')
  verifyPasswordReset(@Body() body: { email: string; code: string }) {
    const svc: any = this.auth as any;
    if (typeof svc.verifyPasswordReset === 'function') {
      return svc.verifyPasswordReset(body.email, body.code);
    }
    return this.auth.verifyCode(body.email, body.code);
  }

  @Post('reset-password/complete')
  completePasswordReset(@Body() body: { token: string; newPassword: string }) {
    const svc: any = this.auth as any;
    if (typeof svc.completePasswordReset === 'function') {
      return svc.completePasswordReset(body.token, body.newPassword);
    }
    return {
      ok: false,
      message:
        'completePasswordReset is not implemented on AuthService. Please add authService.completePasswordReset(token, newPassword).',
    };
  }

  // ========= GOOGLE OAUTH: Redirect flow =========

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleLogin() {
    // Passport редіректить на Google
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: any, @Res() res: Response) {
    try {
      const data = await this.auth.loginWithGoogle(req.user as any);

      // СТАВИМО refresh у HttpOnly cookie
      res.cookie('refreshToken', data.refreshToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 днів
      });

      // accessToken у фрагмент (або взагалі без нього — тоді фронт зробить /auth/refresh або /auth/me)
      const successUrl = process.env.OAUTH_SUCCESS_REDIRECT || 'http://localhost:3001/auth/success';
      const url = new URL(successUrl);
      const fragment = new URLSearchParams({
        accessToken: data.accessToken,
      }).toString();

      return res.redirect(`${url.toString()}#${fragment}`);
    } catch {
      const failureUrl = process.env.OAUTH_FAILURE_REDIRECT || 'http://localhost:3001/auth/failure';
      return res.redirect(failureUrl);
    }
  }

  // ========= GOOGLE OAUTH: One-Tap / ID Token =========

  @Post('google/one-tap')
  async oneTap(@Body() body: { idToken: string }, @Res() res: Response) {
    if (!body?.idToken) throw new BadRequestException('idToken is required');

    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: body.idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const p = ticket.getPayload();
    if (!p?.sub || !p?.email) throw new BadRequestException('Invalid Google token');

    const data = await this.auth.loginWithGoogle({
      googleId: p.sub,
      email: p.email.toLowerCase(),
      emailVerified: !!p.email_verified,
      name: p.name || null,
      avatar: p.picture || null,
    });

    // refresh у HttpOnly cookie
    res.cookie('refreshToken', data.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });

    // access + user у JSON
    return res.json({ user: data.user, accessToken: data.accessToken });
  }
}
