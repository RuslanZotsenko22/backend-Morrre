import { Module, forwardRef } from '@nestjs/common';
import { BullMqProviders } from './bullmq.provider';
import { VideoQueue } from './video.queue';
import { VideoProcessor } from './video.processor';
import { VimeoModule } from '../vimeo/vimeo.module';
import { CasesModule } from '../cases/cases.module';

@Module({
  imports: [
    VimeoModule,
    forwardRef(() => CasesModule), 
  ],
  providers: [...BullMqProviders, VideoQueue, VideoProcessor],
  exports: [VideoQueue],
})
export class QueueModule {}
