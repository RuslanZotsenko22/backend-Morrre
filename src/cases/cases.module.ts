import { Module, forwardRef } from '@nestjs/common';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Case, CaseSchema } from './schemas/case.schema';
import { MediaModule } from '../media/media.module';
import { QueueModule } from '../queue/queue.module';



@Module({
  imports: [
    MongooseModule.forFeature([{ name: Case.name, schema: CaseSchema }]),
    MediaModule,
    forwardRef(() => QueueModule), // ⬅️ важливо
  ],
  controllers: [CasesController],
  providers: [CasesService],
  exports: [MongooseModule, CasesService], // ⬅️ щоб QueueModule міг інжектити CasesService
})
export class CasesModule {}
