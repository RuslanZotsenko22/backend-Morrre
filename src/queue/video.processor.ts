import { Inject, OnModuleInit, forwardRef, Injectable } from '@nestjs/common';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';            
import { QUEUE_TOKENS } from './bullmq.provider';
import { VimeoService } from '../vimeo/vimeo.service';
import { CasesService } from '../cases/cases.service';

@Injectable()
export class VideoProcessor implements OnModuleInit {
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
        const { caseId, filePath } = job.data;
        const folderId = await this.vimeo.ensureFolder(caseId);
        await this.cases.pushVideoMeta(caseId, { status: 'uploading' });
        const { vimeoId } = await this.vimeo.uploadToVimeo(filePath, folderId);
        await this.cases.updateVideoStatus(caseId, vimeoId, { status: 'processing' });
        return true;
      },
      {
        connection: this.connection,
        limiter: { max: 12, duration: 1000 },
      },
    );
  }
}
