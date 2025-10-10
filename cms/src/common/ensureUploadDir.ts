import { existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'

export function ensureHireUploadDir(dir = process.env.HIRE_UPLOAD_DIR || './uploads/hire') {
  const abs = resolve(process.cwd(), dir)
  if (!existsSync(abs)) mkdirSync(abs, { recursive: true })
  return abs
}