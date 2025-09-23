import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { CasesService } from '../cases/cases.service';
import { VimeoService } from './vimeo.service'; // ← за потреби змінити шлях

@Controller('vimeo/webhook')
export class VimeoWebhookController {
  constructor(
    private readonly cases: CasesService,
    private readonly vimeo: VimeoService,
  ) {}

  /**
   * Best-effort перевірка підпису. Для продакшену обовʼязково подавай сирий rawBody
   * (наприклад, через Nest middleware з `req.rawBody`) замість JSON.stringify(body),
   * бо змінений порядок полів може зламати підпис.
   */
  private verifySignature(rawBody: string, signature: string | undefined) {
    const secret = process.env.VIMEO_WEBHOOK_SECRET || '';
    if (!secret) return true; // якщо секрет не заданий — пропускаємо (MVP)
    if (!signature) return false;
    const h = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return h === signature;
  }

  /** Дістаємо ідентифікатор Vimeo з різних можливих місць тіла події */
  private extractVimeoId(payload: any): string | undefined {
    const uri: string | undefined =
      payload?.clip?.uri ??
      payload?.video?.uri ??
      payload?.uri ??
      payload?.resource?.uri;

    if (typeof uri === 'string' && uri.includes('/videos/')) {
      // приклад: /videos/123456789
      const parts = uri.split('/').filter(Boolean);
      return parts[parts.length - 1];
    }

    // запасні варіанти
    return (
      payload?.video?.id ??
      payload?.clip?.id ??
      payload?.id ??
      undefined
    );
  }

  /** Нормалізуємо назву події */
  private extractEvent(payload: any): string | undefined {
    return (
      payload?.event?.type ||
      payload?.type ||
      payload?.event ||
      payload?.event_name ||
      undefined
    );
  }

  @Post()
  async handle(@Body() body: any, @Headers('x-vimeo-signature') sig?: string) {
    // ⚠️ У проді заміни JSON.stringify(body) на справжній rawBody
    const ok = this.verifySignature(JSON.stringify(body), sig);
    if (!ok) {
      throw new UnauthorizedException('Invalid Vimeo signature');
    }

    const event = this.extractEvent(body);
    const vimeoId = this.extractVimeoId(body);

    // обробляємо завершення транскодування
    const isTranscodeComplete =
      event === 'video.transcode.complete' ||
      event === 'transcode.complete' ||
      body?.event?.subtype === 'transcode.complete';

    if (isTranscodeComplete && vimeoId) {
      try {
        const meta = await this.vimeo.getVideoMeta(vimeoId);
        await this.cases.updateVideoStatusByVimeoId(vimeoId, {
          status: 'ready',
          playbackUrl: meta?.playbackUrl,
          thumbnailUrl: meta?.thumbnailUrl,
        });
      } catch (e) {
        // щоб Vimeo не ретраїв безкінечно, повертаємо 200, але логуємо в Sentry/логах
        // Якщо хочеш примусити ретрай — кинь 5xx
        throw new InternalServerErrorException('Failed to update case from Vimeo meta');
      }
    }

    // інші події можна проглатити з 200 OK — Vimeo очікує тільки 2xx
    return { ok: true };
  }
}
