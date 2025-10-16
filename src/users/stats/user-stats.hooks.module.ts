import { Module } from '@nestjs/common';
import { UserStatsHooksService } from './user-stats.hooks.service';
import { UserStatsQueueModule } from './user-stats.queue.module';
import { CasesModule } from '../../cases/cases.module';
import { FollowsModule } from '../../users/follows.module';

@Module({
  imports: [
    // беремо моделі Case / CaseVote / Follow з цих модулів
    CasesModule,
    FollowsModule,
    // і саму чергу 'user-stats'
    UserStatsQueueModule,
  ],
  providers: [UserStatsHooksService],
})
export class UserStatsHooksModule {}
