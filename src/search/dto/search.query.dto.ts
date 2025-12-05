import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchQueryDto {
  @IsString()
  @Transform(({ value }) => String(value || '').trim())
  q!: string;

  @IsOptional()
  @IsIn(['all', 'users', 'cases', 'bots'])
  type: 'all' | 'users' | 'bots' | 'cases' = 'all' ;

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;
}
