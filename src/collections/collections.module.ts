import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Collection, CollectionSchema } from './schemas/collection.schema'
import { Case, CaseSchema } from '../cases/schemas/case.schema'
import { CollectionsService } from './collections.service'
import { CollectionsController } from './collections.controller'
import { InternalCollectionsController } from './internal-collections.controller'
import { ConfigModule } from '@nestjs/config'
import { RedisCacheService } from '../common/redis/redis-cache.service'

@Module({
  imports: [
    ConfigModule, 
    MongooseModule.forFeature([
      { name: Collection.name, schema: CollectionSchema },
      { name: Case.name, schema: CaseSchema },
    ]),
  ],
  controllers: [CollectionsController, InternalCollectionsController],
  providers: [CollectionsService, RedisCacheService],
  exports: [CollectionsService, RedisCacheService],
})
export class CollectionsModule {}
