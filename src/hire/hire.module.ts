import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HireRequest, HireRequestSchema } from './schemas/hire-request.schema';
import { HireService } from './hire.service';
import { HireController } from './hire.controller';
import { ChatModule } from '../chat/chat.module'; 

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HireRequest.name, schema: HireRequestSchema },
    ]),
    forwardRef(() => ChatModule), 
  ],
  providers: [HireService],
  controllers: [HireController],
  exports: [HireService],
})
export class HireModule {}
