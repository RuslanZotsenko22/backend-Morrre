import { IsEnum, IsOptional, IsString, Max, Min } from 'class-validator'

export class UpdateBlockDto {
  @IsOptional() @IsEnum(['text','iframe','media'] as any)
  kind?: 'text' | 'iframe' | 'media'

  // text
  @IsOptional() @IsString()
  textMd?: string

  // iframe
  @IsOptional() @IsEnum(['youtube','vimeo'] as any)
  iframePlatform?: 'youtube' | 'vimeo'
  @IsOptional() @IsString()
  iframeUrl?: string

  // media
  @IsOptional() @IsEnum(['image','video'] as any)
  mediaType?: 'image' | 'video'
  @IsOptional() @IsString()
  mediaUrl?: string

  // style
  @IsOptional() @Min(0) @Max(100)
  borderRadius?: number
  @IsOptional() @Min(0) @Max(100)
  gap?: number
}
