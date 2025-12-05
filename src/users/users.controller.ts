import { 
  Controller, 
  Get, 
  Patch, 
  Body, 
  UseGuards, 
  Req, 
  Query,
  Optional, 
  Post,
  Delete,
  UseInterceptors,
  UploadedFile,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UsersRatingService } from './users-rating.service';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import * as multer from 'multer';

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    @Optional() private readonly rating?: UsersRatingService,
  ) {}
@UseGuards(JwtAuthGuard)
  @Get()
  async listUsers(
    @Query('q') q?: string,
    @Query('limit') limit = '20',
    @Query('offset') offset = '0',
  ) {
    const lim = parseInt(limit, 10) || 20;
    const off = parseInt(offset, 10) || 0;

    return this.users.searchPublicUsers({
      search: q,
      limit: lim,
      offset: off,
    });
  }
  @Get('check-username')
  async checkUsername(@Query('u') u: string, @Req() req: any) {
    if (!u || u.length < 3) return { available: false };

    const excludeId = req?.user?.userId;

    const available = typeof (this.users as any).isUsernameAvailable === 'function'
      ? await (this.users as any).isUsernameAvailable(u, excludeId)
      // fallback на випадок, якщо метод тимчасово відсутній:
      : !(await (this.users as any).findByUsername?.(u));

    return { available };
  }

  @Get('check-email')
  async checkEmail(@Query('e') e: string) {
    if (!e) return { available: false };
    const found = await this.users.findByEmail(e);
    return { available: !found };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req) {
    return this.users.findByIdPublic(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  update(@Req() req, @Body() body: any) {
    return this.users.updateProfile(req.user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/password')
  changePassword(@Req() req, @Body() body: any) {
    return (this.users as any).changePassword
      ? (this.users as any).changePassword(req.user.userId, body?.oldPassword, body?.newPassword)
      : { ok: false, message: 'changePassword service method is not implemented' };
  }

  // === FIXED AVATAR UPLOAD ROUTE ===
  @UseGuards(JwtAuthGuard)
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('avatar', {
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype?.startsWith('image/')) {
        return cb(new BadRequestException('Only image/* files are allowed'), false);
      }
      cb(null, true);
    },
  }))
  async uploadAvatar(@Req() req, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided (field name must be "avatar")');
    }

    try {
      return (this.users as any).uploadAvatar
        ? await (this.users as any).uploadAvatar(req.user.userId, file)
        : { ok: false, message: 'uploadAvatar service method is not implemented' };
    } catch (e: any) {
      if (e?.name === 'MulterError') {
        // напр. LIMIT_FILE_SIZE
        throw new BadRequestException(e.message);
      }
      // інші помилки (наприклад Cloudinary) підуть у глобальний фільтр
      throw e;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  deleteMe(@Req() req) {
    return (this.users as any).softDelete
      ? (this.users as any).softDelete(req.user.userId)
      : { ok: false, message: 'softDelete service method is not implemented' };
  }

  @Get('by-username/:username/profile')
  getPublicByUsername(@Param('username') username: string) {
    return (this.users as any).getPublicProfileByUsername
      ? (this.users as any).getPublicProfileByUsername(username)
      : { ok: false, message: 'getPublicProfileByUsername service method is not implemented' };
  }

  @Get('rating')
  async leaderboard(
    @Query('period') period: 'weekly' | 'all' = 'all',
    @Query('limit') limit = '20',
    @Query('offset') offset = '0',
  ) {
    const lim = parseInt(limit, 10) || 20;
    const off = parseInt(offset, 10) || 0;
    const per: 'weekly' | 'all' = period === 'weekly' ? 'weekly' : 'all';

    if (!this.rating) {
      return { items: [], limit: lim, offset: off, period: per, note: 'UsersRatingService not wired yet' };
    }

    return this.rating.leaderboard({ period: per, limit: lim, offset: off });
  }
}
