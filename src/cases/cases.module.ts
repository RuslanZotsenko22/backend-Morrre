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
import { PaletteService } from './palette/palette.service'
import { InternalCasesController } from './internal-cases.controller'
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Case.name,      schema: CaseSchema },
      { name: CaseVote.name,  schema: CaseVoteSchema },
      { name: CaseView.name,  schema: CaseViewSchema },
       { name: Collection.name, schema: CollectionSchema },
    ]),
    MediaModule,
    forwardRef(() => QueueModule),
  ],
  controllers: [CasesController, InternalCasesController],
  providers: [CasesService, RedisCacheService, PaletteService],
  exports: [MongooseModule, CasesService, RedisCacheService],
})
export class CasesModule {}
