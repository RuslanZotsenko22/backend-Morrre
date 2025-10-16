// src/cases/cases.module.ts
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

// ✅ ДОДАНО: моделі User і Follow, бо вони інжектяться у CasesService
import { User, UserSchema } from '../users/schemas/user.schema';
import { Follow, FollowSchema } from '../users/schemas/follow.schema';

// ✅ ДОДАНО: Draft-модель + контролер/сервіс
import { CaseDraft, CaseDraftSchema } from './schemas/case-draft.schema';
import { CaseDraftsController } from './case-drafts.controller';
import { CaseDraftsService } from './case-drafts.service';

// ✅ ДОДАНО: сервіс прибирання orphan-папок uploads/cases
import { DraftsJanitorService } from './drafts-janitor.service';

// ✅ ДОДАНО: модуль черги user-stats (щоб інʼєктити токен 'user-stats' у CasesService)
import { UserStatsQueueModule } from '../users/stats/user-stats.queue.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Case.name,       schema: CaseSchema },
      { name: CaseVote.name,   schema: CaseVoteSchema },
      { name: CaseView.name,   schema: CaseViewSchema },
      { name: Collection.name, schema: CollectionSchema },

      // ✅ ДОДАНО: провайдери UserModel і FollowModel в контексті CasesModule
      { name: User.name,    schema: UserSchema },
      { name: Follow.name,  schema: FollowSchema },

      // ✅ ДОДАНО: Draft-модель для чернеток кейсів
      { name: CaseDraft.name, schema: CaseDraftSchema },
    ]),
    MediaModule,
    forwardRef(() => QueueModule),

    // ✅ ДОДАНО: підключили модуль, який експортує BullMQ Queue з токеном 'user-stats'
    UserStatsQueueModule,
  ],
  controllers: [
    CasesController,
    InternalCasesController,

    // ✅ ДОДАНО: контролер чернеток
    CaseDraftsController,
  ],
  providers: [
    CasesService,
    RedisCacheService,
    PaletteService,

    // ✅ ДОДАНО: сервіс чернеток та прибиральник orphan-папок
    CaseDraftsService,
    DraftsJanitorService,
  ],
  exports: [MongooseModule, CasesService, RedisCacheService],
})
export class CasesModule {}
