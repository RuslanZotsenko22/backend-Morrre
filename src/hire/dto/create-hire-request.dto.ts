import { IsArray, IsOptional, IsString, MaxLength, ArrayMaxSize } from 'class-validator'
import { WHAT_DONE_ENUM } from '../../cases/schemas/case.schema'

export class CreateHireRequestDto {
  @IsString()
  @MaxLength(120)
  title!: string

  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  categories!: string[] 

  @IsOptional()
  @IsString()
  @MaxLength(120)
  budget?: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string
}

// helper: фільтруємо тільки дозволені категорії
export function sanitizeCategories(input: unknown): string[] {
  const arr = Array.isArray(input) ? input : []
  const out: string[] = []
  for (const v of arr) {
    if (typeof v !== 'string') continue
    const k = v.trim()
    if (!k) continue
    if ((WHAT_DONE_ENUM as readonly string[]).includes(k) && !out.includes(k)) out.push(k)
    if (out.length >= 3) break
  }
  return out
}
