import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FollowsService } from './follows.service';
import { Follow, FollowSchema } from './schemas/follow.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Follow.name, schema: FollowSchema }]),
  ],
  providers: [FollowsService],
  exports: [FollowsService],
})
export class FollowsModule1 {}