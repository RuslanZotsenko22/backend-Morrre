import { Injectable } from '@nestjs/common';
import type { Express } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class LocalMediaService {
  
  async upload(
    file: Express.Multer.File,
    opts?: { folder?: string; filename?: string },
  ) {
    if (!file?.buffer) throw new Error('Empty file buffer');

    
    const baseDir = path.resolve(process.cwd(), 'public', 'uploads');
    await fs.mkdir(baseDir, { recursive: true });

    const folder = (opts?.folder || 'avatars').replace(/^\/+|\/+$/g, '');
    const dir = path.join(baseDir, folder);
    await fs.mkdir(dir, { recursive: true });

    
    const ext =
      (file.mimetype?.split('/')?.[1] || 'png')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') || 'png';

    
    const name =
      opts?.filename ||
      `f_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const filename = `${name}.${ext}`;
    const outPath = path.join(dir, filename);

    await fs.writeFile(outPath, file.buffer);

    const publicBase = process.env.PUBLIC_URL || 'http://localhost:4000';
    const url = `${publicBase}/uploads/${folder}/${filename}`;

    return { url, secure_url: url, path: outPath };
  }

 
  async uploadImageVariants(
    file: Express.Multer.File,
    opts?: { folder?: string; filename?: string },
  ) {
    const uploaded = await this.upload(file, {
      folder: opts?.folder ?? 'cases/covers',
      filename: opts?.filename,
    });

    return {
      low: uploaded.url,
      mid: uploaded.url,
      full: uploaded.url,
    };
  }
}
