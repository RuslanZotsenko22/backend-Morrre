import { Body, Controller, Headers, Post } from '@nestjs/common';
import { CasesService } from '../cases/cases.service';
import * as crypto from 'crypto';

@Controller('vimeo/webhook')
export class VimeoWebhookController {
  constructor(private readonly cases: CasesService) {}

  private verifySignature(rawBody: string, signature: string) {
    const secret = process.env.VIMEO_WEBHOOK_SECRET || '';
    const h = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return h === signature;
  }

  @Post()
  async handle(@Body() body: any, @Headers('x-vimeo-signature') sig: string) {
    // TODO: отримай rawBody через middleware якщо потрібна сувора перевірка
    // if (!this.verifySignature(JSON.stringify(body), sig)) throw new UnauthorizedException();

    const event = body?.event?.type || body?.type;
    const videoId = body?.clip?.uri?.split('/').pop();

    if (event === 'video.transcode.complete' && videoId) {
      // тут треба знати caseId (можна зберігати мапу vimeoId->caseId у БД)
      // для MVP — оновлюємо всі кейси, де є цей vimeoId
      // (для прод — потрібна інша структуризація)
      // casesService.updateVideoStatus(caseId, vimeoId, { status: 'ready', playbackUrl, thumbnailUrl })
    }

    return { ok: true };
  }
}
