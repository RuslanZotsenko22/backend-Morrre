import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import sharp from 'sharp';
import type { Express } from 'express';
import { ImageVariantsService } from './image-variants.service'

@Injectable()
export class MediaService {
  private hasCloudinaryUrl: boolean;
  private hasCloudinaryTriplet: boolean;

  constructor(
    private readonly variants: ImageVariantsService, // ✅ акуратно додано в кінець (DI вже підключили у MediaModule)
  ) {
    // Підійде і коли є CLOUDINARY_URL, і коли є окремі три змінні
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });

    // Мінімальна валідація на старті (не логуємо значення)
    this.hasCloudinaryUrl = !!process.env.CLOUDINARY_URL;
    this.hasCloudinaryTriplet = !!(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    );
    // якщо немає ключів — не валимо старт; нижче метод зробить фолбек на локальне збереження
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
   * Приймає один файл (file.buffer), генерує webp-варіанти: low/mid/full.
   * 1) Якщо Cloudinary налаштований — вантажимо у хмари й повертаємо https-URL-и Cloudinary.
   * 2) Якщо Cloudinary не налаштований або аплоад впав — акуратно робимо фолбек
   *    у локальне сховище через ImageVariantsService (URL-и /uploads/cases/covers/...).
   */
  async uploadImageVariants(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File is required');
    if (!file.buffer || !file.buffer.length) {
      // Якщо тут порожньо — у контролері не увімкнений memoryStorage()
      throw new BadRequestException('Empty file buffer. Did you enable memoryStorage in FileInterceptor?');
    }

    // Якщо Cloudinary недоступний — одразу робимо локальні варіанти
    const cloudinaryConfigured = this.hasCloudinaryUrl || this.hasCloudinaryTriplet;
    if (!cloudinaryConfigured) {
      // ✅ Фолбек: локальні webp-версії + повертаємо /uploads/cases/covers URLs
      return this.variants.makeCoverVariants(file);
    }

    // Генеруємо 3 webp-версії (як і було у твоєму коді)
    let full: Buffer, mid: Buffer, low: Buffer;
    try {
      const src = file.buffer;
      [full, mid, low] = await Promise.all([
        sharp(src).webp({ quality: 90 }).toBuffer(),
        sharp(src).resize(1280).webp({ quality: 80 }).toBuffer(),
        sharp(src).resize(480).webp({ quality: 70 }).toBuffer(),
      ]);
    } catch (e: any) {
      // Якщо sharp впаде — повідомляємо коректно
      throw new BadRequestException(`Image processing failed: ${e?.message || 'sharp error'}`);
    }

    // Вантажимо одночасно у Cloudinary
    try {
      const [lowUrl, midUrl, fullUrl] = await Promise.all([
        this.uploadBuf(low, 'covers/low'),
        this.uploadBuf(mid, 'covers/mid'),
        this.uploadBuf(full, 'covers/full'),
      ]);

      return { low: lowUrl, mid: midUrl, full: fullUrl };
    } catch (e: any) {
      // Якщо Cloudinary не налаштований або повернув помилку — робимо безпечний фолбек у локальне сховище
      const msg = String(e?.message || '');
      const isConfigError = /api_key|cloud name|signature|credentials/i.test(msg);
      if (isConfigError || !this.hasCloudinaryUrl && !this.hasCloudinaryTriplet) {
        // ✅ Фолбек: локально через ImageVariantsService
        return this.variants.makeCoverVariants(file);
      }
      throw new InternalServerErrorException(`Cloudinary upload failed: ${e?.message || 'unknown error'}`);
    }
  }
}
