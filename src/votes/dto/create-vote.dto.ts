import { IsInt, Min, Max } from 'class-validator'

export class CreateVoteDto {
  @IsInt() @Min(1) @Max(10)
  design!: number

  @IsInt() @Min(1) @Max(10)
  creativity!: number

  @IsInt() @Min(1) @Max(10)
  content!: number
}
