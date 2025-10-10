import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Vote, VoteSchema } from './schemas/vote.schema'
import { VotesService } from './votes.service'
import { VotesController } from './votes.controller'
import { Case, CaseSchema } from '../cases/schemas/case.schema'
import { User, UserSchema } from '../users/schemas/user.schema' // імпортуй свій шлях до User

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Vote.name, schema: VoteSchema },
      { name: Case.name, schema: CaseSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [VotesService],
  controllers: [VotesController],
  exports: [VotesService],
})
export class VotesModule {}
