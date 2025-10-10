import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateHireStatusDto {
  @IsIn(['new', 'seen', 'replied', 'closed'])
  status!: 'new' | 'seen' | 'replied' | 'closed'

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  replyMessage?: string
}
