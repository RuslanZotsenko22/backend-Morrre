import { Body, Controller, Delete, Param, Patch, Post, Req } from '@nestjs/common';
import { Types } from 'mongoose';
import { UserPageService } from './user-page.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SetCaseOrderDto } from './dto/set-case-order.dto';
import { FollowsService } from './follows.service'; 


@Controller('me')
export class MeController {
constructor(
private readonly svc: UserPageService,
private readonly follows: FollowsService,
) {}


@Patch('profile')
updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
return this.svc.updateProfile(new Types.ObjectId(req.user.id), dto);
}


@Post('cases/order')
setOrder(@Req() req: any, @Body() dto: SetCaseOrderDto) {
return this.svc.setCaseOrder(new Types.ObjectId(req.user.id), dto.caseIds);
}


@Post('follow/:id')
follow(@Req() req: any, @Param('id') targetId: string) {
return this.follows.follow(req.user.id, targetId);
}


@Delete('follow/:id')
unfollow(@Req() req: any, @Param('id') targetId: string) {
return this.follows.unfollow(req.user.id, targetId);
}
}