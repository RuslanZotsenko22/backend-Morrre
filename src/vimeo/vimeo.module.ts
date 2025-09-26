import { Module, forwardRef } from '@nestjs/common';
import { VimeoService } from './vimeo.service';
import { VimeoWebhookController } from './vimeo.webhook.controller';
import { CasesModule } from '../cases/cases.module';

@Module({
  imports: [forwardRef(() => CasesModule)], 
  providers: [VimeoService],
  controllers: [VimeoWebhookController],
  exports: [VimeoService],                   
})
export class VimeoModule {}
