import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { CasesModule } from '../cases/cases.module';
import { HomeController } from './home.controller';
import { PopularScheduler } from './home.scheduler';
import { InternalHomeController } from './internal-home.controller'
import { RedisCacheService } from '../common/redis/redis-cache.service'
import { ConfigModule } from '@nestjs/config'
import { CollectionsModule } from '../collections/collections.module'
@Module({
  imports: [
    CollectionsModule,
    CasesModule,
    ConfigModule,
    ScheduleModule.forRoot(), 
  ],
  controllers: [HomeController, InternalHomeController],
  providers: [PopularScheduler, RedisCacheService], // планувальник щоденної публікації
})
export class HomeModule {}
