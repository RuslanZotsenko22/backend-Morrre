import {
  IsArray,
  ArrayMaxSize,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  IsNumber,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// Налаштування відступів і скруглення для кейса
class LayoutSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(200)
  blockSpacing?: number; // відстань між блоками в px

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  borderRadius?: number; // скруглення в px
}

export class CreateCaseDto {
  @IsString()
  @MinLength(2)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  categories?: string[];

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contributors?: string[];

  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';

  @IsOptional()
  @IsIn(['horizontal', 'vertical', 'square'])
  coverFormat?: 'horizontal' | 'vertical' | 'square';

  @IsOptional()
  @ValidateNested()
  @Type(() => LayoutSettingsDto)
  layoutSettings?: LayoutSettingsDto; // одна настройка на весь кейс
}
