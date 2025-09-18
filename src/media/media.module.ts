import { Module } from '@nestjs/common';
import { MediaService } from './cloudinary.service';
@Module({ providers: [MediaService], exports: [MediaService] })
export class MediaModule {}
