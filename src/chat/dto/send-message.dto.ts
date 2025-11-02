import { IsIn, IsOptional, IsString, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

class MediaDto {
  @IsString() url: string;
  @IsString() publicId: string;
  @IsString() mime: string;
  @IsOptional() @IsString() size?: any;  
  @IsOptional() @IsString() width?: any;
  @IsOptional() @IsString() height?: any;
}

export class SendMessageDto {
  @IsIn(['text','media','template']) type: 'text'|'media'|'template';
  @IsOptional() @IsString() text?: string;
  @IsOptional() @IsString() templateKey?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MediaDto)
  media?: MediaDto[];
}
