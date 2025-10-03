import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { CasesModule } from '../cases/cases.module';
import { QueueModule } from '../queue/queue.module';

@Module({
    imports: [CasesModule,QueueModule,], 
  controllers: [InternalController],
})
export class InternalModule {}
