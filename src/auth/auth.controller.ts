
import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestCodeDto } from './dto/request-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { CompleteRegisterDto } from './dto/complete-register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  
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

  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  logout() {
    return { ok: true };
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
}
