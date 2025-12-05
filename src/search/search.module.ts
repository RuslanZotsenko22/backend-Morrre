import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

// моделі
import { User, UserSchema } from '../users/schemas/user.schema';
import { Case, CaseSchema } from '../cases/schemas/case.schema';
// профіль користувача для displayName / avatar
import { UserProfile, UserProfileSchema } from '../users/schemas/user-profile.schema';
import { BotnetModule } from '../botnet/botnet.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name,         schema: UserSchema },
      { name: UserProfile.name,  schema: UserProfileSchema },
      { name: Case.name,         schema: CaseSchema },
    ]),
     BotnetModule,
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
