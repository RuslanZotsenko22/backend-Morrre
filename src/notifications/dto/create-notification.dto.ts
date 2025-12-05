import { IsEnum, IsMongoId, IsObject, IsOptional } from 'class-validator';

export class CreateNotificationDto {
  @IsMongoId()
  recipient: string;

  @IsMongoId()
  actor: string;

  @IsEnum(['LIKE_CASE', 'LIKE_REFERENCE', 'FOLLOW', 'COMMENT', 'VOTE', 'REFERENCE_TAKEN'])
  type: string;

  @IsObject()
  @IsOptional()
  metadata?: any;
}