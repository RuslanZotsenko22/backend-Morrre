import { IsOptional, IsString } from 'class-validator';

export class ListMessagesQueryDto {
  @IsOptional() @IsString() beforeId?: string;
  @IsOptional() @IsString() afterId?: string;
  @IsOptional() @IsString() limit?: string; 
}
