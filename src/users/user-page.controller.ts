
import { Controller, Get, Param, Query, Req, UsePipes, ValidationPipe } from '@nestjs/common';
import { Types } from 'mongoose';
import { UserPageService } from './user-page.service';
import { GetUserCasesQueryDto } from './dto/get-user-cases.query';

// Працюємо під тим же префіксом, що й твій існуючий users.controller
// (з глобальним префіксом у main.ts це буде /api/users)
@Controller('users')
export class UserPageController {
  constructor(private readonly svc: UserPageService) {}

  @Get(':id/profile')
  getProfile(@Param('id') id: string, @Req() req: any) {
    const viewerId = req.user?.id;
    return this.svc.getPublicProfile(new Types.ObjectId(id), viewerId);
  }

  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @Get(':id/cases')
  getCases(
    @Param('id') id: string,
    @Query() query: GetUserCasesQueryDto,
  ) {
    return this.svc.getUserCases(new Types.ObjectId(id), {
      sort: query.sort,
      categories: query.categories,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string) {
    return this.svc.getUserStats(new Types.ObjectId(id));
  }

  @Get(':id/follow/state')
  getFollowState(@Param('id') id: string, @Req() req: any) {
    return this.svc.getFollowState(new Types.ObjectId(id), req.user?.id);
  }
}
