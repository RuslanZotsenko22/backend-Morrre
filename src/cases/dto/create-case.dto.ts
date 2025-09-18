import { IsArray, ArrayMaxSize, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
export class CreateCaseDto {
  @IsString() @MinLength(2) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(3) @IsString({ each: true }) categories?: string[];
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) contributors?: string[];
  @IsOptional() @IsIn(['draft','published']) status?: 'draft'|'published';
}
