// src/queue/video.queue.ts
import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_TOKENS } from './bullmq.provider';
import * as path from 'path'; // ➕ додано: знадобиться для jobId

@Injectable()
export class VideoQueue {
  constructor(@Inject(QUEUE_TOKENS.VIDEO_QUEUE) private queue: Queue) {}

  // ✅ лишив як є — не чіпав
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

  // ---------------------------
  // ➕ НОВЕ: безпечні розширення
  // ---------------------------

  /** Хелпер для стабільного jobId по файлу */
  private buildUploadJobId(caseId: string, filePath: string) {
    const base = path.basename(filePath || '');
    return `upload:${caseId}:${base}`;
  }

  /**
   * Безпечний аплоад у Vimeo з ідемпотентністю (не дублює той самий файл)
   * і опційним ensureFolder. Не ламає існуючий воркер 'upload' — можна
   * використовувати той же processor, просто читати поля з data.
   */
  async enqueueUploadEnhanced(job: {
    caseId: string;
    filePath: string;
    ensureFolder?: boolean; // створити папку кейса, якщо ще немає
    userId?: string;        // хто ініціював (для трекінгу)
    priority?: number;      // 1..10 (менше = вища пріоритетність у BullMQ)
  sectionIndex?: number; // ✅
  blockIndex?: number;   // ✅
  
  }) {
    const jobId = this.buildUploadJobId(job.caseId, job.filePath);
    return this.queue.add('upload', job, {
      jobId, // ідемпотентність
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false, // залишаємо у черзі для дебагу
      priority: job.priority, // опційно
    });
  }

  /**
   * Створення (або валідація) Vimeo-папки під кейс/чернетку.
   * Може оброблятись окремим воркером 'ensure-folder' або в межах 'upload'.
   */
  async enqueueEnsureFolder(job: { caseId: string }) {
    return this.queue.add('ensure-folder', job, {
      jobId: `ensure-folder:${job.caseId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  /**
   * Прибирання: видалити всі відео в папці кейса та (опційно) саму папку.
   * Підійде для DELETE кейса або TTL-чисток.
   */
  async enqueueCleanup(job: { caseId: string; vimeoFolderId?: string }) {
    return this.queue.add('cleanup-vimeo', job, {
      jobId: `cleanup:${job.caseId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  /**
   * Опційно: низький пріоритет масових аплоадів (щоб “ручні” мали перевагу).
   */
  async enqueueUploadLowPrio(job: { caseId: string; filePath: string; ensureFolder?: boolean }) {
    const jobId = this.buildUploadJobId(job.caseId, job.filePath);
    return this.queue.add('upload', { ...job }, {
      jobId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
      priority: 10, // нижчий пріоритет
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
