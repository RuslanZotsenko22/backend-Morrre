import { 
  Controller, 
  Get, 
  Patch, 
  Body, 
  UseGuards, 
  Req, 
  Query,
  Optional, 
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';


import { UsersRatingService } from './users-rating.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    
    @Optional() private readonly rating?: UsersRatingService,
  ) {}

  @Get('check-username')
  async checkUsername(@Query('u') u: string) {
    if (!u || u.length < 3) return { available: false };
    const found = typeof (this.users as any).findByUsername === 'function'
      ? await (this.users as any).findByUsername(u)
      : await this.users['model']?.findOne?.({ username: u }); 
    return { available: !found };
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
