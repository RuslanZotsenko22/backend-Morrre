import { Body, Controller, Headers, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { CaseDraft } from '../cases/schemas/case-draft.schema'
import { Case } from '../cases/schemas/case.schema'
import { VimeoApi } from './vimeo.api'
import * as crypto from 'crypto'

@Controller('vimeo')
export class VimeoWebhookController {
  constructor(
    @InjectModel(CaseDraft.name) private readonly draftModel: Model<CaseDraft>,
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    private readonly vimeo: VimeoApi,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async onWebhook(@Req() req: any, @Body() body: any, @Headers() headers: Record<string, string>) {
    // 0) HMAC-перевірка (опційна)
    this.assertHmacOrSkip(req, headers)

    // 1) Тип події і відео
    const event = body?.event || body?.type || 'unknown'
    const videoUri: string | undefined =
      body?.clip?.uri || body?.video?.uri || body?.resource?.uri
    if (!videoUri) return { ok: true, reason: 'no video uri' }

    // 2) Витягуємо метадані відео (у description збережено наш JSON)
    const meta = await this.vimeo.getVideoMeta(videoUri).catch(() => null)
    const desc = meta?.description || ''
    let parsed: any = {}
    try { parsed = JSON.parse(desc) } catch {}

    if (parsed?.kind !== 'case-media') return { ok: true, reason: 'no case-media meta' }

    const caseId: string = parsed.caseId
    const sectionIndex: number = parsed.sectionIndex
    const blockIndex: number = parsed.blockIndex

    const playerUrl =
      meta?.player_embed_url || (meta?.link && toPlayer(meta.link))
    if (!playerUrl) return { ok: true, reason: 'no player url' }

    const vimeoId: string | undefined =
      (meta?.uri && String(meta.uri).split('/').pop()) || undefined

    // 3) Оновлюємо Draft (або Case, якщо вже опубліковано)
    const draftRes = await this.draftModel.updateOne(
      {
        _id: caseId,
        [`sections.${sectionIndex}.blocks.${blockIndex}.mediaUrl`]: 'processing://vimeo',
      } as any,
      {
        $set: {
          [`sections.${sectionIndex}.blocks.${blockIndex}.mediaUrl`]: playerUrl,
          [`sections.${sectionIndex}.blocks.${blockIndex}.mediaType`]: 'video',
          [`sections.${sectionIndex}.blocks.${blockIndex}.kind`]: 'media',

          
          [`sections.${sectionIndex}.blocks.${blockIndex}.mediaStatus`]: 'ready',
          [`sections.${sectionIndex}.blocks.${blockIndex}.mediaError`]: undefined,
          ...(vimeoId
            ? { [`sections.${sectionIndex}.blocks.${blockIndex}.vimeoId`]: vimeoId }
            : {}),
        },
      } as any,
    )

    if (draftRes.modifiedCount === 0) {
      await this.caseModel.updateOne(
        {
          _id: caseId,
          [`content.${sectionIndex}.blocks.${blockIndex}.mediaUrl`]: 'processing://vimeo',
        } as any,
        {
          $set: {
            [`content.${sectionIndex}.blocks.${blockIndex}.mediaUrl`]: playerUrl,
            [`content.${sectionIndex}.blocks.${blockIndex}.mediaType`]: 'video',
            [`content.${sectionIndex}.blocks.${blockIndex}.kind`]: 'media',

            // статуси
            [`content.${sectionIndex}.blocks.${blockIndex}.mediaStatus`]: 'ready',
            [`content.${sectionIndex}.blocks.${blockIndex}.mediaError`]: undefined,
            ...(vimeoId
              ? { [`content.${sectionIndex}.blocks.${blockIndex}.vimeoId`]: vimeoId }
              : {}),
          },
        } as any,
      )
    }

    return { ok: true, event }
  }

  /** Якщо VIMEO_WEBHOOK_SECRET заданий — перевіряємо HMAC, інакше пропускаємо. */
  private assertHmacOrSkip(req: any, headers: Record<string, string>) {
    const secret = process.env.VIMEO_WEBHOOK_SECRET
    if (!secret) return // перевірка вимкнена — сумісно з поточним флоу

    // сире тіло: у main.ts вже налаштовано raw() для /api/vimeo/webhook
    const raw: Buffer =
      Buffer.isBuffer(req.body) ? req.body :
      (req.rawBody ? req.rawBody : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body)))

    // шукаємо підпис у поширених заголовках
    const sigHeader =
      (headers['vimeo-signature'] as string) ||
      (headers['x-vimeo-signature'] as string) ||
      (headers['vimeo-webhook-signature'] as string) ||
      ''

    if (!sigHeader) {
      throw new UnauthorizedException('Missing Vimeo signature')
    }

    // підтримка форматів: "sha256=abcdef...", "abcdef...", "t=...,sha256=..."
    const parsed = parseSignature(sigHeader)
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex')

    // опційний контроль часу, якщо є timestamp у заголовку
    const toleranceSec = Number(process.env.VIMEO_WEBHOOK_TOLERANCE_SECONDS || 300)
    if (parsed.timestamp) {
      const now = Math.floor(Date.now() / 1000)
      const skew = Math.abs(now - parsed.timestamp)
      if (skew > toleranceSec) {
        throw new UnauthorizedException('Vimeo webhook timestamp outside tolerance')
      }
    }

    if (!timingSafeEqualHex(parsed.hash, expected)) {
      throw new UnauthorizedException('Invalid Vimeo webhook signature')
    }
  }
}

/** Підтримує "sha256=...", "t=123,sha256=...", або просто сам хеш */
function parseSignature(header: string): { hash: string; timestamp?: number } {
  const s = String(header).trim()

  // t=...,sha256=...
  if (s.includes(',')) {
    const parts = s.split(',').map(p => p.trim())
    let hash = ''
    let timestamp: number | undefined
    for (const p of parts) {
      const [k, v] = p.split('=')
      if (k === 'sha256') hash = (v || '').toLowerCase()
      if (k === 't' || k === 'ts' || k === 'timestamp') {
        const num = Number(v)
        if (Number.isFinite(num)) timestamp = num
      }
    }
    return { hash, timestamp }
  }

 
  const m = s.match(/^sha256=(.+)$/i)
  if (m) return { hash: m[1].toLowerCase() }

  // просто хеш
  return { hash: s.toLowerCase() }
}

/** Постійний-час порівняння двох hex-рядків */
function timingSafeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

function toPlayer(link: string) {
  const m = String(link || '').match(/vimeo\.com\/(\d+)/)
  return m ? `https://player.vimeo.com/video/${m[1]}` : link
}
