import { IsIn, IsOptional, IsString } from 'class-validator';

export class InteractionDto {
  @IsIn(['view', 'save', 'share', 'refLike'])
  type!: 'view' | 'save' | 'share' | 'refLike';

  /** Опційно: референс/блок/джерело (для refLike або трекінгу) */
  @IsOptional()
  @IsString()
  refId?: string;

  /** Опційно: хто взаємодіє (userId або анонімний fingerprint/ip) */
  @IsOptional()
  @IsString()
  actor?: string;
}
