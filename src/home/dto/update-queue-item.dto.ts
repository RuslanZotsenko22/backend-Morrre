import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdateQueueItemDto {
  @IsOptional()
  @IsIn(['queued', 'published'])
  status?: 'queued' | 'published';

  @IsOptional()
  @IsBoolean()
  forceToday?: boolean;
}
