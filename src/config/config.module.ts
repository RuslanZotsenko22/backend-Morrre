import { Module } from '@nestjs/common';
import { ConfigModule as Root } from '@nestjs/config';

@Module({
  imports: [Root.forRoot({ isGlobal: true, envFilePath: '.env' })],
})
export class ConfigModule {}
