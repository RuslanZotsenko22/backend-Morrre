import { Controller, Delete, Param, Post, Req, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { FollowsService } from './follows.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'

@ApiTags('users')
@Controller('users')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Post(':id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Підписатися на користувача' })
  async follow(@Param('id') targetId: string, @Req() req: any) {
    const userId = req?.user?.userId || req?.user?._id || req?.user?.id
    return this.follows.follow(userId, targetId)
  }

  @Delete(':id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Відписатися від користувача' })
  async unfollow(@Param('id') targetId: string, @Req() req: any) {
    const userId = req?.user?.userId || req?.user?._id || req?.user?.id
    return this.follows.unfollow(userId, targetId)
  }
}
