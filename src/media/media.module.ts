// src/media/media.module.ts
import { Module } from '@nestjs/common';
import { MediaService } from './cloudinary.service';

@Module({
  providers: [MediaService],
  exports: [MediaService], // 👈 додай це
})
export class MediaModule {}
