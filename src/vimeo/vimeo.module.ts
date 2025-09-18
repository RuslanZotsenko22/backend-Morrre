import { Module, forwardRef } from '@nestjs/common';
import { VimeoService } from './vimeo.service';
import { VimeoWebhookController } from './vimeo.webhook.controller';
import { CasesModule } from '../cases/cases.module';

@Module({
  imports: [forwardRef(() => CasesModule)], // ✅ якщо вебхук використовує CasesService
  providers: [VimeoService],
  controllers: [VimeoWebhookController],
  exports: [VimeoService],                   // ✅ QueueModule залежить від VimeoService
})
export class VimeoModule {}
