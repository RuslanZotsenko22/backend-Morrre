// src/media/upload.util.ts
import { diskStorage } from 'multer';
import type { Options } from 'multer';
import { promises as fs } from 'fs';
import { extname } from 'path';

export const uploadVideoMulter: Options = {
  storage: diskStorage({
    destination: async (req, file, cb) => {
      try {
        const dir = 'tmp/videos';
        await fs.mkdir(dir, { recursive: true });
        cb(null, dir);
      } catch (e) {
        cb(e as any, undefined as any);
      }
    },
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `${unique}${extname(file.originalname)}`);
    },
  }),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB, за потреби зміни
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype?.startsWith('video/')) return cb(null, true);
    cb(new Error('Only video files are allowed'));
  },
};
