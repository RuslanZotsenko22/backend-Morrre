import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { QueueModule } from '../queue/queue.module';

@Module({
    imports: [QueueModule], 
  controllers: [InternalController],
})
export class InternalModule {}
