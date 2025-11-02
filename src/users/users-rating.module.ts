import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersRatingService } from './users-rating.service';
import { UsersRatingScheduler } from './users-rating.scheduler';
import { UserStats, UserStatsSchema } from './schemas/user-stats.schema';
import { CasesModule } from '../cases/cases.module';

@Module({
  imports: [
    
    MongooseModule.forFeature([{ name: UserStats.name, schema: UserStatsSchema }]),
    
    forwardRef(() => CasesModule),
  ],
  providers: [UsersRatingService, UsersRatingScheduler],
  exports: [UsersRatingService],
})
export class UsersRatingModule {}
