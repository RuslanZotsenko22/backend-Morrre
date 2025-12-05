import { IsMongoId } from 'class-validator';

export class CreateReferralLinkDto {
  @IsMongoId()
  juryId: string;
}