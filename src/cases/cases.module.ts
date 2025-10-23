
import { Module, forwardRef } from '@nestjs/common';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Case, CaseSchema } from './schemas/case.schema';
import { CaseVote, CaseVoteSchema } from './schemas/case-vote.schema';
import { CaseView, CaseViewSchema } from './schemas/case-view.schema';
import { Collection, CollectionSchema } from '../collections/schemas/collection.schema';
import { MediaModule } from '../media/media.module';
import { QueueModule } from '../queue/queue.module';
import { RedisCacheService } from '../common/redis/redis-cache.service';
import { PaletteService } from './palette/palette.service';
import { InternalCasesController } from './internal-cases.controller';
import { CasesInteractionsController } from './cases-interactions.controller';

import { User, UserSchema } from '../users/schemas/user.schema';
import { Follow, FollowSchema } from '../users/schemas/follow.schema';


import { CaseDraft, CaseDraftSchema } from './schemas/case-draft.schema';
import { CaseDraftsController } from './case-drafts.controller';
import { CaseDraftsService } from './case-drafts.service';


import { DraftsJanitorService } from './drafts-janitor.service';


import { UserStatsQueueModule } from '../users/stats/user-stats.queue.module';

import { PopularQueue, PopularQueueSchema } from '../home/schemas/popular-queue.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Case.name,       schema: CaseSchema },
      { name: CaseVote.name,   schema: CaseVoteSchema },
      { name: CaseView.name,   schema: CaseViewSchema },
      { name: Collection.name, schema: CollectionSchema },

      
      { name: User.name,    schema: UserSchema },
      { name: Follow.name,  schema: FollowSchema },

      
      { name: CaseDraft.name, schema: CaseDraftSchema },
    ]),
    MediaModule,
    forwardRef(() => QueueModule),

    MongooseModule.forFeature([
  { name: PopularQueue.name, schema: PopularQueueSchema },
]),
    
    UserStatsQueueModule,
  ],
  controllers: [
    CasesController,
    InternalCasesController,
CasesInteractionsController,
    
    CaseDraftsController,
  ],
  providers: [
    CasesService,
    RedisCacheService,
    PaletteService,

    
    CaseDraftsService,
    DraftsJanitorService,
  ],
  exports: [MongooseModule, CasesService, RedisCacheService],
})
export class CasesModule {}
