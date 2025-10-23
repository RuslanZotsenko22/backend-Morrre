import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersRatingService } from './users-rating.service';
import { UsersRatingScheduler } from './users-rating.scheduler';
import { UserStats, UserStatsSchema } from './schemas/user-stats.schema';
import { CasesModule } from '../cases/cases.module';

@Module({
  imports: [
    // зберігаємо власну модель user_stats
    MongooseModule.forFeature([{ name: UserStats.name, schema: UserStatsSchema }]),
    // беремо моделі Case / CaseVote / інше з готового CasesModule
    forwardRef(() => CasesModule),
  ],
  providers: [UsersRatingService, UsersRatingScheduler],
  exports: [UsersRatingService],
})
export class UsersRatingModule {}
