import { Inject, OnModuleInit, forwardRef, Injectable, Logger } from '@nestjs/common';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { QUEUE_TOKENS } from './bullmq.provider';
import { VimeoService } from '../vimeo/vimeo.service';
import { CasesService } from '../cases/cases.service';

@Injectable()
export class VideoProcessor implements OnModuleInit {
  private readonly logger = new Logger(VideoProcessor.name);

  constructor(
    @Inject(QUEUE_TOKENS.REDIS) private readonly connection: Redis,
    private readonly vimeo: VimeoService,
    @Inject(forwardRef(() => CasesService))
    private readonly cases: CasesService,
  ) {}

 onModuleInit() {
  new Worker(
    'video-uploads',
    async (job) => {
      try {
        switch (job.name) {
          case 'upload': {
            
            return true;
          }
          case 'sync-case': {
            const { id } = job.data as { id: string };
            this.logger.log(`sync-case received id=${id} jobId=${job.id} attempts=${job.attemptsMade}`);
            await this.cases.syncFromMongo(id);
            this.logger.log(`sync-case done id=${id}`);
            return true;
          }
          default:
            this.logger.warn(`Unknown job: ${job.name}`);
            return true;
        }
      } catch (e: any) {
        this.logger.error(`sync-case failed: ${e?.message ?? e}`, e?.stack);
        throw e; 
      }
    },
    { connection: this.connection, limiter: { max: 12, duration: 1000 } },
  );
}
}
