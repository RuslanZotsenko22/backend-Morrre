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
import { MediaModule } from '../media/media.module'; // ✅ ВЖЕ ДОДАНО
import { VimeoWorkerService } from './vimeo-worker.service';

// ✅ ДОДАНО: модель драфтів, бо VimeoWorkerService її інжектить
import { CaseDraft, CaseDraftSchema } from '../cases/schemas/case-draft.schema';

@Module({
  imports: [
    VimeoModule,
    forwardRef(() => CasesModule),

    // ✅ ДОДАНО: MediaModule, щоб VimeoApi був доступний у цьому модулі
    MediaModule,

    // Щоб PopularProcessor і VimeoWorkerService могли інжектити моделі:
    MongooseModule.forFeature([
      { name: Case.name, schema: CaseSchema },
      { name: CaseDraft.name, schema: CaseDraftSchema }, // ✅ ДОДАНО
    ]),
  ],
  providers: [
    ...BullMqProviders,
    VideoQueue,
    VideoProcessor,
    PopularProcessor, // <<<
    PopularScheduler,
    VimeoWorkerService, // <<<
  ],
  exports: [VideoQueue],
})
export class QueueModule {}
