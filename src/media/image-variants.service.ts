// src/media/image-variants.service.ts
import { Injectable } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import sharp from 'sharp'

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true })
}

@Injectable()
export class ImageVariantsService {
  private baseDir = process.env.CASE_UPLOAD_DIR
    ? path.resolve(process.cwd(), process.env.CASE_UPLOAD_DIR)
    : path.resolve(process.cwd(), 'uploads', 'cases')

  async makeCoverVariants(file: Express.Multer.File) {
    if (!file?.buffer && !file?.path) {
      throw new Error('Image file buffer or path is required')
    }

    const coversDir = path.join(this.baseDir, 'covers')
    ensureDir(coversDir)

    const ts = Date.now()
    const rid = Math.round(Math.random() * 1e6)
    const baseName = `${ts}-${rid}`

    const src = file.buffer ?? fs.readFileSync(file.path)

    // Розміри (можеш підкрутити під свій дизайн)
    const lowBuf  = await sharp(src).resize(480).webp({ quality: 75 }).toBuffer()
    const midBuf  = await sharp(src).resize(1080).webp({ quality: 82 }).toBuffer()
    const fullBuf = await sharp(src).webp({ quality: 90 }).toBuffer()

    const lowName  = `${baseName}-low.webp`
    const midName  = `${baseName}-mid.webp`
    const fullName = `${baseName}-full.webp`

    fs.writeFileSync(path.join(coversDir, lowName),  lowBuf)
    fs.writeFileSync(path.join(coversDir, midName),  midBuf)
    fs.writeFileSync(path.join(coversDir, fullName), fullBuf)

    // URL-адреси для віддачі (статикою у main.ts)
    const prefix = '/uploads/cases/covers'
    return {
      low:  `${prefix}/${lowName}`,
      mid:  `${prefix}/${midName}`,
      full: `${prefix}/${fullName}`,
    }
  }
}
