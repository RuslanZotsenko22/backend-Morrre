import { Injectable } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import sharp from 'sharp';
import * as fs from 'fs/promises';
import type { Express } from 'express';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

@Injectable()
export class MediaService {
  async uploadImageVariants(file: Express.Multer.File) {
    const buf = await fs.readFile(file.path);

    // Готуємо 3 версії webp
    const full = await sharp(buf).webp({ quality: 90 }).toBuffer();
    const mid = await sharp(buf).resize(1280).webp({ quality: 80 }).toBuffer();
    const low = await sharp(buf).resize(480).webp({ quality: 70 }).toBuffer();

    // Обгортка upload_stream у Promise з коректним звуженням типів
    const uploadBuf = (buffer: Buffer, folder: string) =>
      new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder, resource_type: 'image', format: 'webp' },
          (error: any, result?: UploadApiResponse) => {
            if (error || !result) {
              return reject(error || new Error('Cloudinary: empty result'));
            }
            resolve(result.secure_url);
          },
        );
        stream.end(buffer);
      });

    const [lowUrl, midUrl, fullUrl] = await Promise.all([
      uploadBuf(low, 'covers/low'),
      uploadBuf(mid, 'covers/mid'),
      uploadBuf(full, 'covers/full'),
    ]);

    // Прибираємо тимчасовий файл
    await fs.unlink(file.path).catch(() => {});

    return { low: lowUrl, mid: midUrl, full: fullUrl };
  }
}
