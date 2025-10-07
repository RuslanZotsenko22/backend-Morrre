import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  ArrayUnique,
} from 'class-validator'

class CoverDto {
  @IsIn(['image', 'video'])
  type!: 'image' | 'video'

  @IsUrl()
  url!: string

  @IsOptional()
  @IsString()
  alt?: string
}

export class UpdateCollectionDto {
  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsString()
  slug?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional() // дозволяємо null, щоб очистити cover
  cover?: CoverDto | null

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  cases?: string[]

  @IsOptional()
  @IsBoolean()
  featured?: boolean

  @IsOptional()
  @IsNumber()
  order?: number
}
