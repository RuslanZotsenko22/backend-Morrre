import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'

// ПРАВИЛЬНЕ підключення саме нодової збірки:
const VibrantNode = require('node-vibrant/node')
const Vibrant: any = VibrantNode?.default ?? VibrantNode

function toHex(c: string) {
  try {
    if (!c) return null
    let s = c.toString().trim().toLowerCase()
    if (s.startsWith('#')) s = s.slice(1)
    if (s.length === 3) s = s.split('').map(ch => ch + ch).join('')
    if (s.length !== 6) return null
    const n = Number.parseInt(s, 16)
    if (Number.isNaN(n)) return null
    return `#${s}`
  } catch {
    return null
  }
}

function uniq<T>(arr: T[]) {
  const set = new Set<string>()
  const out: T[] = []
  for (const it of arr) {
    const key = typeof it === 'string' ? it.toLowerCase() : JSON.stringify(it)
    if (!set.has(key)) {
      set.add(key)
      out.push(it)
    }
  }
  return out
}

@Injectable()
export class PaletteService {
  private readonly logger = new Logger(PaletteService.name)

  /** завантажити зображення як Buffer */
  private async fetchImageBuffer(url: string): Promise<Buffer | null> {
    try {
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 10_000,
        // за бажанням: перевірка content-type -> image/*
      })
      return Buffer.from(res.data)
    } catch (e: any) {
      this.logger.verbose?.(`fetch fail ${url}: ${e?.message || e}`)
      return null
    }
  }

  /** витягнути до N кольорів (hex) з одного зображення */
  private async extractFromOne(url: string, maxColors = 4): Promise<string[]> {
    const buf = await this.fetchImageBuffer(url)
    if (!buf) return []
    try {
      // ВАЖЛИВО: використовуємо конструктор із нодової збірки
      const vib = new Vibrant(buf, { colorCount: Math.max(4, maxColors) })
      const palette = await vib.getPalette()
      const hexes = Object.values(palette || {})
        .filter(Boolean)
        .map((swatch: any) => toHex(swatch?.getHex?.() || swatch?.hex || ''))
        .filter(Boolean) as string[]
      return uniq(hexes).slice(0, maxColors)
    } catch (e: any) {
      this.logger.verbose?.(`vibrant error ${url}: ${e?.message || e}`)
      return []
    }
  }

  /** основний метод: приймає список посилань на зображення, повертає 1..8 кольорів */
  async buildPalette(imageUrls: string[], limit = 8): Promise<string[]> {
    const urls = uniq(
      (imageUrls || [])
        .map(u => (typeof u === 'string' ? u.trim() : ''))
        .filter(u => /^https?:\/\//i.test(u)),
    ).slice(0, 10) // safety cap

    const chunks: string[] = []
    for (const url of urls) {
      const part = await this.extractFromOne(url, 4)
      for (const c of part) {
        if (chunks.length >= limit) break
        chunks.push(c)
      }
      if (chunks.length >= limit) break
    }
    return uniq(chunks).slice(0, limit)
  }
}
