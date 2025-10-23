

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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

import { UsersRatingService } from './users-rating.service';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    @Optional() private readonly rating?: UsersRatingService,
  ) {}

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

  
  @UseGuards(JwtAuthGuard)
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  uploadAvatar(@Req() req, @UploadedFile() file: Express.Multer.File) {
    return (this.users as any).uploadAvatar
      ? (this.users as any).uploadAvatar(req.user.userId, file)
      : { ok: false, message: 'uploadAvatar service method is not implemented' };
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
