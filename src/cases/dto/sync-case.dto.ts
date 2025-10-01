import { IsString, IsNotEmpty } from 'class-validator';

export class SyncCaseDto {
  @IsString()
  @IsNotEmpty()
  id: string;
}
