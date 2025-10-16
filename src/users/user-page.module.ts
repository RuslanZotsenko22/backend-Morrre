import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CasesModule } from '../cases/cases.module';
import { FollowsModule } from './follows.module'; 
import { UserPageController } from './user-page.controller';
import { MeController } from './me.controller';
import { UserPageService } from './user-page.service';
import { UserStatsService } from './stats/user-stats.service';
import { UserProfile, UserProfileSchema } from './schemas/user-profile.schema';
import { UserStats, UserStatsSchema } from './schemas/user-stats.schema';
import { UserStatsInternalController } from './stats/user-stats.internal.controller';
import { UserStatsQueueModule } from './stats/user-stats.queue.module';
@Module({
  imports: [
    CasesModule,
    FollowsModule, 
    UserStatsQueueModule,
    MongooseModule.forFeature([
      { name: UserProfile.name, schema: UserProfileSchema },
      { name: UserStats.name, schema: UserStatsSchema },
    ]),
  ],
  controllers: [UserPageController, MeController, UserStatsInternalController],
  providers: [UserPageService, UserStatsService],
})
export class UserPageModule {}
