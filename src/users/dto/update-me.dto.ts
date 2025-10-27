
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class SocialsDto {
  @IsOptional() @IsString() behance?: string;
  @IsOptional() @IsString() dribbble?: string;
  @IsOptional() @IsString() instagram?: string;
  @IsOptional() @IsString() linkedin?: string;
  @IsOptional() @IsString() x?: string;
  @IsOptional() @IsString() website?: string;
}

export class UpdateMeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() about?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  industries?: string[];

  @IsOptional() @IsArray() @IsString({ each: true })
  whatWeDid?: string[];

  @IsOptional() @ValidateNested() @Type(() => SocialsDto)
  socials?: SocialsDto;
}
