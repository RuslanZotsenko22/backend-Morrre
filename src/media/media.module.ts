// src/media/media.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { VimeoWebhookController } from './vimeo.webhook.controller';

import { CaseDraft, CaseDraftSchema } from '../cases/schemas/case-draft.schema';
import { Case, CaseSchema } from '../cases/schemas/case.schema';

import { VimeoApi } from './vimeo.api';
import { ImageVariantsService } from './image-variants.service';

// ВАЖЛИВО: використовуємо Cloudinary-реалізацію MediaService
import { MediaService } from './cloudinary.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CaseDraft.name, schema: CaseDraftSchema },
      { name: Case.name, schema: CaseSchema },
    ]),
  ],
  controllers: [VimeoWebhookController],
  providers: [
    MediaService,          // Cloudinary + fallback на локальні варіанти
    VimeoApi,
    ImageVariantsService,  // потрібен для фолбеку локальних варіантів
  ],
  exports: [
    MediaService,
    VimeoApi,
    ImageVariantsService,
  ],
})
export class MediaModule {}
