import { IsString, Length, MinLength } from 'class-validator';
export class CompleteRegisterDto {
  @IsString() token: string;                // одноразовий токен після verify
  @IsString() @Length(3, 24) username: string;
  @IsString() @Length(1, 60) name: string;
  @IsString() @MinLength(8) password: string;
}
