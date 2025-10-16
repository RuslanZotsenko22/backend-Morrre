import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';

export class GetUserCasesQueryDto {
  @IsIn(['author', 'popular', 'date'])
  @IsString()
  sort: 'author' | 'popular' | 'date' = 'date';

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    const arr = Array.isArray(value) ? value : String(value).split(',');
    const cleaned = arr
      .map((s) => String(s).trim())
      .filter(Boolean)
      .map((s) => s.slice(0, 48).toLowerCase()); // нормалізуємо і ріжемо надто довгі
    // унікальні значення
    return Array.from(new Set(cleaned)).slice(0, 20);
  })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(48, { each: true })
  categories?: string[];

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 12;

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(0)
  offset = 0;
}
