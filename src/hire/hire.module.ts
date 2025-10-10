import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { HireRequest, HireRequestSchema } from './schemas/hire-request.schema'
import { HireService } from './hire.service'
import { HireController } from './hire.controller'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HireRequest.name, schema: HireRequestSchema },
    ]),
  ],
  providers: [HireService],
  controllers: [HireController],
  exports: [HireService],
})
export class HireModule {}
