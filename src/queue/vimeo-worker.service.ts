import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common'
import { Worker, QueueEvents, Queue } from 'bullmq'
import { QUEUE_TOKENS } from './bullmq.provider'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { CaseDraft } from '../cases/schemas/case-draft.schema'
import { Case } from '../cases/schemas/case.schema'
import { VimeoApi } from '../media/vimeo.api'
@Injectable()
export class VimeoWorkerService implements OnModuleInit {
  private readonly log = new Logger(VimeoWorkerService.name)
  private worker?: Worker
  private events?: QueueEvents

 constructor(
  @Inject(QUEUE_TOKENS.VIDEO_QUEUE)
  private readonly queue: Queue,

  @InjectModel(CaseDraft.name)
  private readonly draftModel: Model<CaseDraft>,

  @InjectModel(Case.name)
  private readonly caseModel: Model<Case>,

  private readonly vimeoApi: VimeoApi, 
) {}

  onModuleInit() {
    const connection = (this.queue as any)?.opts?.connection
    this.worker = new Worker(
      this.queue.name,
      async (job) => {
        const { name, data } = job
        if (name === 'ensure-folder') {
          if (this.vimeoApi) await this.vimeoApi.ensureFolder(data.caseId)
          else this.log.warn('No Vimeo API bound: ensure-folder skipped')
          return { ok: true }
        }
        if (name === 'upload-video' || name === 'upload') {
          if (this.vimeoApi) {
            if (data.ensureFolder) await this.vimeoApi.ensureFolder(data.caseId)
            const video = await this.vimeoApi.uploadFile(data.caseId, data.filePath)
            this.log.log(`Uploaded case=${data.caseId} vimeoId=${video.id}`)
          } else {
            this.log.warn('No Vimeo API bound: upload skipped')
          }
          return { ok: true }
        }
        if (name === 'cleanup-vimeo') {
          if (this.vimeoApi) await this.vimeoApi.cleanupFolder(data.caseId).catch(err => this.log.warn(String(err)))
          else this.log.warn('No Vimeo API bound: cleanup skipped')
          return { ok: true }
        }

        if (name === 'delete-video') {
  if (this.vimeoApi) {
    await this.vimeoApi.deleteVideo(data.vimeoId).catch(err => this.log.warn(String(err)))
  } else {
    this.log.warn('No Vimeo API bound: delete-video skipped')
  }
  return { ok: true }
}

        this.log.warn(`Unknown job "${name}"`)
        return { ok: false }
      },
      { connection, concurrency: 3 },
    )

    this.events = new QueueEvents(this.queue.name, { connection })
    this.events.on('completed', ({ jobId }) => this.log.log(`Job ${jobId} completed`))
    this.events.on('failed', ({ jobId, failedReason }) => this.log.warn(`Job ${jobId} failed: ${failedReason}`))
    this.log.log(`VimeoWorker attached to queue "${this.queue.name}"`)
  }

  private async markBlockStatus(caseId: string, sectionIndex: number, blockIndex: number, patch: any) {
  // Спочатку пробуємо Draft
  const draftRes = await this.draftModel.updateOne(
    { _id: caseId } as any,
    { $set: Object.fromEntries(Object.entries(patch).map(([k,v]) => [`sections.${sectionIndex}.blocks.${blockIndex}.${k}`, v])) } as any,
  )
  if (draftRes.modifiedCount === 0) {
    // Якщо Draft не оновився — пробуємо Case (вже опубліковано)
    await this.caseModel.updateOne(
      { _id: caseId } as any,
      { $set: Object.fromEntries(Object.entries(patch).map(([k,v]) => [`content.${sectionIndex}.blocks.${blockIndex}.${k}`, v])) } as any,
    )
  }
}

}
