import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { CasesModule } from '../cases/cases.module';
import { HomeController } from './home.controller';
import { PopularScheduler } from './home.scheduler';

@Module({
  imports: [
    CasesModule,
    ScheduleModule.forRoot(), // вмикаємо крон
  ],
  controllers: [HomeController],
  providers: [PopularScheduler], // планувальник щоденної публікації
})
export class HomeModule {}
