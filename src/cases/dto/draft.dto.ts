import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

export class UpsertBlockDto {
  @IsEnum(['text', 'iframe', 'media'] as any)
  kind!: 'text' | 'iframe' | 'media'

  @IsOptional()
  @IsString()
  textMd?: string

  @IsOptional()
  @IsEnum(['youtube', 'vimeo'] as any)
  iframePlatform?: 'youtube' | 'vimeo'

  @IsOptional()
  @IsString()
  iframeUrl?: string

  @IsOptional()
  @IsEnum(['image', 'video'] as any)
  mediaType?: 'image' | 'video'

  @IsOptional()
  @IsString()
  mediaUrl?: string

  @IsOptional()
  @Min(0)
  @Max(100)
  borderRadius?: number

  @IsOptional()
  @Min(0)
  @Max(100)
  gap?: number
}

export class UpsertSectionDto {
  @IsInt()
  @Min(0)
  @Max(99)
  sectionIndex!: number

  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => UpsertBlockDto)
  blocks!: UpsertBlockDto[]
}

export class DraftMetaDto {
  @IsString()
  @MaxLength(160)
  title!: string

  @IsString()
  @MaxLength(64)
  industry!: string // перевірка на енуми у сервісі при потребі

  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  categories!: string[]

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags!: string[]
}
