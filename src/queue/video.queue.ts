import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_TOKENS } from './bullmq.provider';

@Injectable()
export class VideoQueue {
  constructor(@Inject(QUEUE_TOKENS.VIDEO_QUEUE) private queue: Queue) {}

  async enqueueUpload(job: { caseId: string; filePath: string }) {
    return this.queue.add('upload', job, { removeOnComplete: true, attempts: 5, backoff: { type: 'exponential', delay: 2000 } });
  }
}
