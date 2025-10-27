import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import sharp from 'sharp';
import type { Express } from 'express';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { ImageVariantsService } from './image-variants.service';

@Injectable()
export class MediaService {
  private hasCloudinaryUrl: boolean;
  private hasCloudinaryTriplet: boolean;

  constructor(private readonly variants: ImageVariantsService) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });

    this.hasCloudinaryUrl = !!process.env.CLOUDINARY_URL;
    this.hasCloudinaryTriplet = !!(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    );
  }

  /** Helper: заливає buffer у Cloudinary та повертає secure_url */
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
   * Сумісний метод для аватарів/одиночних зображень.
   * Якщо Cloudinary налаштовано — вантажимо в Cloudinary (webp).
   * Інакше — фолбек локально у /uploads/{folder}.
   */
  upload = async (
    file: Express.Multer.File,
    opts?: { folder?: string; filename?: string },
  ): Promise<{ url: string; secure_url: string; path?: string }> => {
    if (!file || !file.buffer || !file.buffer.length) {
      throw new BadRequestException('Empty file buffer');
    }

    const folder = (opts?.folder || 'avatars').replace(/^\/+|\/+$/g, '');
    const cloudinaryConfigured = this.hasCloudinaryUrl || this.hasCloudinaryTriplet;

    if (cloudinaryConfigured) {
      const buf = await sharp(file.buffer).webp({ quality: 90 }).toBuffer();
      const secureUrl = await this.uploadBuf(buf, folder);
      return { url: secureUrl, secure_url: secureUrl };
    }

    // Локальний фолбек
    const baseDir = path.resolve(process.cwd(), 'uploads');
    const dir = path.join(baseDir, folder);
    await fsp.mkdir(dir, { recursive: true });

    const ext =
      (file.mimetype?.split('/')?.[1] || 'png')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') || 'png';

    const name = opts?.filename || `f_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const filename = `${name}.${ext}`;
    const outPath = path.join(dir, filename);

    await fsp.writeFile(outPath, file.buffer);

    const publicBase = process.env.PUBLIC_URL || 'http://localhost:4000';
    const url = `${publicBase}/uploads/${folder}/${filename}`;
    return { url, secure_url: url, path: outPath };
  };

  /**
   * Генерує варіанти (low/mid/full).
   * Cloudinary → три webp у різні папки; інакше — локальний фолбек.
   */
  uploadImageVariants = async (file: Express.Multer.File) => {
    if (!file) throw new BadRequestException('File is required');
    if (!file.buffer || !file.buffer.length) {
      throw new BadRequestException('Empty file buffer. Did you enable memoryStorage in FileInterceptor?');
    }

    const cloudinaryConfigured = this.hasCloudinaryUrl || this.hasCloudinaryTriplet;
    if (!cloudinaryConfigured) {
      return this.variants.makeCoverVariants(file);
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

    try {
      const [lowUrl, midUrl, fullUrl] = await Promise.all([
        this.uploadBuf(low, 'covers/low'),
        this.uploadBuf(mid, 'covers/mid'),
        this.uploadBuf(full, 'covers/full'),
      ]);
      return { low: lowUrl, mid: midUrl, full: fullUrl };
    } catch (e: any) {
      const msg = String(e?.message || '');
      const isConfigError = /api_key|cloud name|signature|credentials/i.test(msg);
      if (isConfigError || (!this.hasCloudinaryUrl && !this.hasCloudinaryTriplet)) {
        return this.variants.makeCoverVariants(file);
      }
      throw new InternalServerErrorException(`Cloudinary upload failed: ${e?.message || 'unknown error'}`);
    }
  };
}
