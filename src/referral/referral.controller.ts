import { Controller, Post, Body, Get, Param, UseGuards } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { CreateReferralLinkDto } from './dto/create-referral-link.dto';
import { UseReferralLinkDto } from './dto/use-referral-link.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller('referral')
@UseGuards(JwtAuthGuard)
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Post('create')
  async createReferralLink(@CurrentUser('id') juryId: string) {
    // Створюємо DTO з juryId з токена
    const createReferralLinkDto: CreateReferralLinkDto = { juryId };
    return this.referralService.createReferralLink(createReferralLinkDto);
  }

  @Post('use')
  async useReferralLink(
    @CurrentUser('id') userId: string,
    @Body() useReferralLinkDto: UseReferralLinkDto
  ) {
    // Оновлюємо DTO з userId з токена
    const updatedUseReferralLinkDto: UseReferralLinkDto = {
      ...useReferralLinkDto,
      userId
    };
    return this.referralService.useReferralLink(updatedUseReferralLinkDto);
  }

  @Get('my-stats')
  async getMyStats(@CurrentUser('id') juryId: string) {
    return this.referralService.getJuryStats(juryId);
  }

  @Get('can-vote')
  async canVote(@CurrentUser('id') userId: string) {
    const canVote = await this.referralService.canUserVote(userId);
    return { canVote };
  }

  @Get('my-links')
  async getMyReferralLinks(@CurrentUser('id') juryId: string) {
    return this.referralService.getJuryReferralLinks(juryId);
  }

  @Get('check-code/:code')
  async checkReferralCode(@Param('code') code: string) {
    // Для перевірки коду не потрібна авторизація
    const referralLink = await this.referralService['referralLinkModel'].findOne({ code });
    
    if (!referralLink) {
      return { valid: false, message: 'Код не знайдено' };
    }

    if (referralLink.isUsed) {
      return { valid: false, message: 'Код вже використано' };
    }

    if (new Date() > referralLink.expiresAt) {
      return { valid: false, message: 'Термін дії коду закінчився' };
    }

    return { 
      valid: true, 
      message: 'Код дійсний',
      expiresAt: referralLink.expiresAt 
    };
  }
}