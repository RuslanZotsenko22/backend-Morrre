import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import sharp from 'sharp';
import type { Express } from 'express';

@Injectable()
export class MediaService {
  constructor() {
    // Підійде і коли є CLOUDINARY_URL, і коли є окремі три змінні
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });

    // Мінімальна валідація на старті (не логуємо значення)
    const hasUrl = !!process.env.CLOUDINARY_URL;
    const hasTriplet = !!(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    );
    if (!hasUrl && !hasTriplet) {
      // не кидаємо помилку тут, щоб Nest стартував;
      // якщо немає ключів — метод нижче кине зрозумілу 400/500
      // console.warn('Cloudinary env is not set');
    }
  }

  private uploadBuf(buffer: Buffer, folder: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image', format: 'webp' },
        (error: any, result?: UploadApiResponse) => {
          if (error || !result) return reject(error || new Error('Cloudinary: empty result'));
          resolve(result.secure_url);
        },
      );
      stream.end(buffer);
    });
  }

  /**
   * Приймає один файл (file.buffer), генерує webp-варіанти: low/mid/full, вантажить у Cloudinary,
   * повертає об’єкт URL-ів.
   */
  async uploadImageVariants(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File is required');
    if (!file.buffer || !file.buffer.length) {
      // Якщо тут порожньо — у контролері не увімкнений memoryStorage()
      throw new BadRequestException('Empty file buffer. Did you enable memoryStorage in FileInterceptor?');
    }

    // Генеруємо 3 webp-версії
    let full: Buffer, mid: Buffer, low: Buffer;
    try {
      const src = file.buffer;
      [full, mid, low] = await Promise.all([
        sharp(src).webp({ quality: 90 }).toBuffer(),
        sharp(src).resize(1280).webp({ quality: 80 }).toBuffer(),
        sharp(src).resize(480).webp({ quality: 70 }).toBuffer(),
      ]);
    } catch (e: any) {
      throw new BadRequestException(`Image processing failed: ${e?.message || 'sharp error'}`);
    }

    // Вантажимо одночасно
    try {
      const [lowUrl, midUrl, fullUrl] = await Promise.all([
        this.uploadBuf(low, 'covers/low'),
        this.uploadBuf(mid, 'covers/mid'),
        this.uploadBuf(full, 'covers/full'),
      ]);

      return { low: lowUrl, mid: midUrl, full: fullUrl };
    } catch (e: any) {
      // Типова помилка: Must supply api_key -> немає env або config не викликаний
      if (/api_key/i.test(String(e?.message))) {
        throw new BadRequestException('Cloudinary not configured: missing API key/secret/cloud name');
      }
      throw new InternalServerErrorException(`Cloudinary upload failed: ${e?.message || 'unknown error'}`);
    }
  }
}
