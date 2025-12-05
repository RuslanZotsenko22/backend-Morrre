import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { CuratorAnalyticsService } from './services/curator-analytics.service';
import { InternalSecretGuard } from '../common/guards/internal-secret.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BotnetService } from './botnet.service';

@Controller('botnet/curator')
export class CuratorAnalyticsController {
  constructor(
    private readonly curatorAnalytics: CuratorAnalyticsService,
    private readonly botnetService: BotnetService,
  ) {}

  @Get('analyze/:caseId')
  @UseGuards(InternalSecretGuard)
  async analyzeCase(@Param('caseId') caseId: string) {
    const analysis = await this.botnetService.analyzeWithCurators(caseId);
    return {
      success: true,
      caseId,
      analysis,
    };
  }

  @Post('boost/:caseId')
  @UseGuards(InternalSecretGuard)
  async applyCuratorBoost(@Param('caseId') caseId: string) {
    return await this.botnetService.applyCuratorBoost(caseId);
  }

  @Get('quality/:caseId')
  @UseGuards(JwtAuthGuard)
  async getContentQuality(@Param('caseId') caseId: string) {
    const quality = await this.curatorAnalytics.analyzeContentQuality(caseId);
    return {
      caseId,
      quality,
    };
  }

  @Get('stats/:caseId')
  @UseGuards(InternalSecretGuard)
  async getCuratorStats(@Param('caseId') caseId: string) {
    const { multiplier, score, curatorCount } = await this.curatorAnalytics.getBoostMultiplier(caseId);
    return {
      caseId,
      boostMultiplier: multiplier,
      curatorScore: score,
      curatorCount,
    };
  }
}