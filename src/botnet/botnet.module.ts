import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';

import { BotnetController } from './botnet.controller';
import { InternalBotnetController } from './internal-botnet.controller';
import { BotnetService } from './botnet.service'; 
import { PayloadApiService } from './services/payload-api.service';
import { BotManagementService } from './services/bot-management.service';
import { BotQueueService } from './services/bot-queue.service';
import { CommentGeneratorService } from './services/comment-generator.service';
import { Bot, BotSchema } from './schemas/bot.schema';
import { BotQueue, BotQueueSchema } from './schemas/bot-queue.schema';
import { CasePublishHook } from './hooks/case-publish.hook';
import { VoteActivityHook } from './hooks/vote-activity.hook';
import { VotesModule } from '../votes/votes.module';
import { QueueWorker } from './workers/queue.worker';
import { CommentsModule } from '../comments/comments.module'
import { LikesModule } from '../likes/likes.module';
import { FollowsModule1 } from '../follows/follows.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Case, CaseSchema } from '../cases/schemas/case.schema';
import { ReferenceManagementService } from './services/reference-management.service';
import { BotHealthMonitorService } from './services/bot-health-monitor.service';
import { AvatarDistributionService } from './services/avatar-distribution.service'; 

import { BotProfileService } from './services/bot-profile.service'; 
import { UsersModule } from '../users/users.module'; 
import { CasesModule } from '../cases/cases.module'; 
import { BotProfileController } from './bot-profile.controller';
import { CuratorAnalyticsModule } from './curator-analytics.module';
import { CuratorAnalyticsController } from './curator-analytics.controller';
import { CuratorAnalyticsService } from './services/curator-analytics.service';
@Module({
  imports: [
    HttpModule,
    MongooseModule.forFeature([
      { name: Bot.name, schema: BotSchema },
      { name: BotQueue.name, schema: BotQueueSchema },
      { name: Case.name, schema: CaseSchema },
    ]),
    forwardRef(() => UsersModule), 
    forwardRef(() => CasesModule),
    forwardRef(() => VotesModule),
    forwardRef(() => CuratorAnalyticsModule),
    CommentsModule,
    LikesModule,
    FollowsModule1,
    NotificationsModule, 
    
    
  ],
  controllers: [BotnetController, InternalBotnetController, BotProfileController, CuratorAnalyticsController],
  providers: [
    BotnetService,
    PayloadApiService,
    BotManagementService,
    BotQueueService,
    CasePublishHook,
    VoteActivityHook,
    CommentGeneratorService,
    QueueWorker,
     ReferenceManagementService,
    BotHealthMonitorService,
    AvatarDistributionService,
     BotProfileService,
     CuratorAnalyticsService,
  ],
  exports: [
    BotnetService,
    CasePublishHook, 
    VoteActivityHook,
    AvatarDistributionService,
     BotProfileService,
     CuratorAnalyticsService,
     MongooseModule.forFeature([{ name: Bot.name, schema: BotSchema }]),
  ],
})
export class BotnetModule {}