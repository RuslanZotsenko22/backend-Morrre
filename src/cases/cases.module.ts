import { Module, forwardRef } from '@nestjs/common';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Case, CaseSchema } from './schemas/case.schema';
import { MediaModule } from '../media/media.module';
import { QueueModule } from '../queue/queue.module';
import { RedisCacheService } from '../common/redis/redis-cache.service'


@Module({
  imports: [
    MongooseModule.forFeature([{ name: Case.name, schema: CaseSchema }]),
    MediaModule,
    forwardRef(() => QueueModule), 
  ],
  controllers: [CasesController],
  providers: [CasesService, RedisCacheService],
  exports: [MongooseModule, CasesService, RedisCacheService], 
})
export class CasesModule {}
