import { IsMongoId, IsString, Length } from 'class-validator';

export class UseReferralLinkDto {
  @IsString()
  @Length(8, 8, { message: 'Код повинен містити рівно 8 символів' })
  code: string;

  @IsMongoId()
  userId: string;
}