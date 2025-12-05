import { IsEnum, IsOptional, IsString, IsMongoId, IsNumber, Min, Max } from 'class-validator';

export enum CuratorRating {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  NEUTRAL = 'neutral',
  BAD = 'bad',
  VERY_BAD = 'very_bad',
}

export enum CuratorAspectRating {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  NEUTRAL = 'neutral',
  BAD = 'bad',
  VERY_BAD = 'very_bad',
}

export class SubmitCuratorRatingDto {
  @IsMongoId()
  caseId: string;

  @IsMongoId()
  curatorId: string;

  @IsEnum(CuratorRating)
  rating: CuratorRating;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  aspects?: {
    design?: CuratorAspectRating;
    creativity?: CuratorAspectRating;
    execution?: CuratorAspectRating;
  };

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1)
  confidence?: number;
}

export class CuratorBoostAdjustmentDto {
  @IsMongoId()
  caseId: string;

  @IsNumber()
  @Min(0.5)
  @Max(1.5)
  boostMultiplier: number;

  @IsOptional()
  @IsString()
  reason?: string;
}