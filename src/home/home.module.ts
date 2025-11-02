import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';

import { CasesModule } from '../cases/cases.module';
import { HomeController } from './home.controller';
import { PopularScheduler } from './home.scheduler';
import { InternalHomeController } from './internal-home.controller';
import { RedisCacheService } from '../common/redis/redis-cache.service';
import { ConfigModule } from '@nestjs/config';
import { CollectionsModule } from '../collections/collections.module';

import { HomeService } from './home.service';


import { PopularQueue, PopularQueueSchema } from './schemas/popular-queue.schema';
import { CaseSchema } from '../cases/schemas/case.schema';

@Module({
  imports: [
    CollectionsModule,
    CasesModule,
    ConfigModule,
    ScheduleModule.forRoot(),

    
    MongooseModule.forFeature([
      { name: PopularQueue.name, schema: PopularQueueSchema },
      { name: 'Case', schema: CaseSchema },
    ]),
  ],
  controllers: [HomeController, InternalHomeController],
  providers: [
    PopularScheduler, 
    RedisCacheService,
    HomeService,      
  ],
  exports: [HomeService],
})
export class HomeModule {}
