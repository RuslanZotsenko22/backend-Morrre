import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InternalSecretGuard } from '../common/guards/internal-secret.guard';
import { SyncCaseDto } from '../cases/dto/sync-case.dto';
import { VideoQueue } from '../queue/video.queue';

@Controller('internal')
@UseGuards(InternalSecretGuard)
export class InternalController {
  constructor(private readonly videoQueue: VideoQueue) {}

  @Post('cases/sync')
  async syncCase(@Body() dto: SyncCaseDto) {
    await this.videoQueue.enqueueSyncCase({ id: dto.id });
    return { ok: true };
  }
}
