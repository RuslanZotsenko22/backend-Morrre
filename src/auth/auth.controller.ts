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

  /**
   * 1) Надіслати код підтвердження на email
   */
  @Post('request-code')
  requestCode(@Body() dto: RequestCodeDto) {
    return this.auth.requestCode(dto.email);
  }

  /**
   * 2) Перевірити код з email і отримати одноразовий токен
   */
  @Post('verify-code')
  verifyCode(@Body() dto: VerifyCodeDto) {
    return this.auth.verifyCode(dto.email, dto.code);
  }

  /**
   * 3) Завершити реєстрацію з token + username, name, password
   */
  @Post('complete-register')
  completeRegister(@Body() dto: CompleteRegisterDto) {
    return this.auth.completeRegister(dto);
  }

  /**
   * (Legacy) Пряма реєстрація без OTP-флоу — залишено для сумісності
   */
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
}
