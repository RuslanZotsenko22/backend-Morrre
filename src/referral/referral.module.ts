import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReferralService } from './referral.service';
import { ReferralController } from './referral.controller';
import { ReferralLink, ReferralLinkSchema } from './schemas/referral-link.schema';
import { JuryStats, JuryStatsSchema } from './schemas/jury-stats.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReferralLink.name, schema: ReferralLinkSchema },
      { name: JuryStats.name, schema: JuryStatsSchema },
    ]),
  ],
  controllers: [ReferralController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}