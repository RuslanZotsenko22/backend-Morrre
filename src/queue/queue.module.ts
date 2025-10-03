import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { BullMqProviders } from './bullmq.provider';
import { VideoQueue } from './video.queue';
import { VideoProcessor } from './video.processor';

import { PopularProcessor } from './popular.processor';
import { PopularScheduler } from './popular.scheduler';

import { VimeoModule } from '../vimeo/vimeo.module';
import { CasesModule } from '../cases/cases.module';
import { Case, CaseSchema } from '../cases/schemas/case.schema';

@Module({
  imports: [
    VimeoModule,
    forwardRef(() => CasesModule),
    // Щоб PopularProcessor міг інжектити модель кейсу:
    MongooseModule.forFeature([{ name: Case.name, schema: CaseSchema }]),
  ],
  providers: [
    ...BullMqProviders,
    VideoQueue,
    VideoProcessor,
    PopularProcessor, // <<<
    PopularScheduler, // <<<
  ],
  exports: [VideoQueue],
})
export class QueueModule {}
