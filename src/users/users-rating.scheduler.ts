import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UsersRatingService } from './users-rating.service';

@Injectable()
export class UsersRatingScheduler {
  private readonly log = new Logger(UsersRatingScheduler.name);

  constructor(private readonly rating: UsersRatingService) {}

 
  @Cron(process.env.USERS_RATING_CRON || '10 4 * * *', {
    timeZone: process.env.USERS_RATING_TZ || 'Europe/Prague',
  })
  async recomputeDaily() {
    this.log.log('Recomputing user ratings...');
    try {
      const res = await this.rating.recomputeAll();
      this.log.log(`Recomputed for ${res.users} users`);
    } catch (e) {
      this.log.error('Users rating recompute failed', e as any);
    }
  }
}
