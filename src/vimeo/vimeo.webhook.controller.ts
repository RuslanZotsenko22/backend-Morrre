import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import type { Request as ExpressRequest } from 'express';
import { CasesService } from '../cases/cases.service';
import { VimeoService } from './vimeo.service'; 

@Controller('vimeo/webhook')
export class VimeoWebhookController {
  private readonly log = new Logger('VimeoWebhook');

  constructor(
    private readonly cases: CasesService,
    private readonly vimeo: VimeoService,
  ) {}

  
  private getRawBody(req: ExpressRequest): string {
    const b: any = (req as any).body;
    if (Buffer.isBuffer(b)) return b.toString('utf8');
    if (typeof b === 'string') return b;
    
    return JSON.stringify(b ?? {});
  }

  
  private verifySignature(rawBody: string, signature?: string): boolean {
    const secret = process.env.VIMEO_WEBHOOK_SECRET || '';
    if (!secret) return true; 
    if (!signature) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return expected === signature;
  }

  
  private extractVimeoId(payload: any): string | undefined {
    const uri: string | undefined =
      payload?.clip?.uri ??
      payload?.video?.uri ??
      payload?.uri ??
      payload?.resource?.uri;

    if (typeof uri === 'string' && uri.includes('/videos/')) {
      const parts = uri.split('/').filter(Boolean);
      return parts[parts.length - 1];
    }
    return payload?.video?.id ?? payload?.clip?.id ?? payload?.id ?? undefined;
  }

  
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
  async handle(
    @Req() req: ExpressRequest,
    
    @Body() _ignored: any,
    @Headers('x-vimeo-signature') sig?: string,
  ) {
    
    const raw = this.getRawBody(req);

    
    const skipSig = process.env.VIMEO_WEBHOOK_DISABLE_SIG === '1';
    if (!skipSig) {
      const secret = process.env.VIMEO_WEBHOOK_SECRET || '';
      if (!secret) throw new UnauthorizedException('Webhook secret is not set');

      
      const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
      this.log.debug(
        `sig/hdr=${(sig ?? '').slice(0, 12)}… exp=${expected.slice(0, 12)}… rawLen=${raw.length}`,
      );

      if (!sig) throw new UnauthorizedException('Missing x-vimeo-signature');
      if (expected !== sig) throw new UnauthorizedException('Invalid Vimeo signature');
    }

    let body: any;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }

    const event = this.extractEvent(body);
    const vimeoId = this.extractVimeoId(body);

    
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
        this.log.log(`Video ${vimeoId} → ready (playback=${!!meta?.playbackUrl})`);
      } catch (e) {
        this.log.error(`Failed to update case by vimeoId=${vimeoId}: ${String(e)}`);
        
        throw new InternalServerErrorException('Failed to update case from Vimeo meta');
       
      }
    } else {
      this.log.debug(`Skip event=${event} vimeoId=${vimeoId ?? 'n/a'}`);
    }

    
    return { ok: true };
  }
}
