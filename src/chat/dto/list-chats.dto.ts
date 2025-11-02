import { IsBooleanString, IsOptional, IsString } from 'class-validator';

export class ListChatsQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsBooleanString() pinnedOnly?: string;
  @IsOptional() @IsString() cursor?: string; 
  @IsOptional() @IsString() limit?: string;  
}
