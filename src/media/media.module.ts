import { Module } from '@nestjs/common';
import { MediaService } from './cloudinary.service';
import { VimeoWebhookController } from './vimeo.webhook.controller';

import { MongooseModule } from '@nestjs/mongoose';
import { CaseDraft, CaseDraftSchema } from '../cases/schemas/case-draft.schema';
import { Case, CaseSchema } from '../cases/schemas/case.schema';

import { VimeoApi } from './vimeo.api';
import { ImageVariantsService } from './image-variants.service'; 

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CaseDraft.name, schema: CaseDraftSchema },
      { name: Case.name, schema: CaseSchema },
    ]),
  ],
  controllers: [VimeoWebhookController],
  providers: [MediaService, VimeoApi, ImageVariantsService],   
  exports:   [MediaService, VimeoApi, ImageVariantsService],   
})
export class MediaModule {}
