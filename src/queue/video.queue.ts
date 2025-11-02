
import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_TOKENS } from './bullmq.provider';
import * as path from 'path'; 

@Injectable()
export class VideoQueue {
  constructor(@Inject(QUEUE_TOKENS.VIDEO_QUEUE) private queue: Queue) {}

  
  async enqueueUpload(job: { caseId: string; filePath: string }) {
    return this.queue.add('upload', job, {
      removeOnComplete: true,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
    });
  }

  //  додано: синхронізація кейсу з Payload
  async enqueueSyncCase(job: { id: string }) {
    return this.queue.add('sync-case', job, {
      jobId: job.id, // ідемпотентність: з таким же id job не задвоїться
      removeOnComplete: true,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
    });
  }

 

  private buildUploadJobId(caseId: string, filePath: string) {
    const base = path.basename(filePath || '');
    return `upload:${caseId}:${base}`;
  }

  
  async enqueueUploadEnhanced(job: {
    caseId: string;
    filePath: string;
    ensureFolder?: boolean; 
    userId?: string;        
    priority?: number;      
  sectionIndex?: number; 
  blockIndex?: number;   
  
  }) {
    const jobId = this.buildUploadJobId(job.caseId, job.filePath);
    return this.queue.add('upload', job, {
      jobId, 
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false, 
      priority: job.priority, 
    });
  }

  
  async enqueueEnsureFolder(job: { caseId: string }) {
    return this.queue.add('ensure-folder', job, {
      jobId: `ensure-folder:${job.caseId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  
  async enqueueCleanup(job: { caseId: string; vimeoFolderId?: string }) {
    return this.queue.add('cleanup-vimeo', job, {
      jobId: `cleanup:${job.caseId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

 
  async enqueueUploadLowPrio(job: { caseId: string; filePath: string; ensureFolder?: boolean }) {
    const jobId = this.buildUploadJobId(job.caseId, job.filePath);
    return this.queue.add('upload', { ...job }, {
      jobId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
      priority: 10, 
    });

    
  }

  async enqueueDeleteVideo(job: { caseId: string; vimeoId: string }) {
  const jobId = `delete-video:${job.caseId}:${job.vimeoId}`
  return this.queue.add('delete-video', job, {
    jobId,
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
  })
}
}
