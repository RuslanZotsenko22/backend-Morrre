import { diskStorage } from 'multer'
import * as path from 'path'
import * as fs from 'fs'
import { BadRequestException } from '@nestjs/common'

export const MAX_IMAGE_MB = Number(process.env.CASE_IMAGE_MAX_MB ?? 20)
export const MAX_IMAGE_SIZE = MAX_IMAGE_MB * 1024 * 1024

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true })
}

export function imageStorageForDraft(draftId: string) {
  const dest =
    process.env.CASE_UPLOAD_DIR || path.resolve(process.cwd(), 'uploads', 'cases', draftId)
  ensureDir(dest)
  return diskStorage({
    destination: dest,
    filename: (_, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      const base = path.basename(file.originalname, ext).replace(/\s+/g, '-').toLowerCase()
      cb(null, `${base}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`)
    },
  })
}

export function imageFileFilter(_: any, file: Express.Multer.File, cb: (err: any, accept: boolean) => void) {
  if (!/^image\//.test(file.mimetype)) {
    return cb(new BadRequestException('Images only'), false)
  }
  cb(null, true)
}
