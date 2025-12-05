import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { BotProfileService, BotProfile } from './services/bot-profile.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { InternalSecretGuard } from '../common/guards/internal-secret.guard';

interface SearchBotsResponse {
  success: boolean;
  data: {
    bots: BotProfile[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
  message?: string;
}

interface GetAllBotsResponse {
  success: boolean;
  data: BotProfile[];
  count: number;
  message?: string;
}

interface GetBotProfileResponse {
  success: boolean;
  data: BotProfile;
  message?: string;
}

interface GetBotsStatsResponse {
  success: boolean;
  data: any;
  message?: string;
}

@Controller('botnet/bots')
@ApiTags('Bot Profiles')
export class BotProfileController {
  private readonly logger = new Logger(BotProfileController.name);

  constructor(private readonly botProfileService: BotProfileService) {}

  @Get('profile/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Отримати повний профіль бота' })
  @ApiParam({ name: 'id', description: 'ID бота' })
  async getBotProfile(@Param('id') botId: string): Promise<GetBotProfileResponse> {
    try {
      const profile = await this.botProfileService.getBotProfile(botId);
      
      if (!profile) {
        throw new NotFoundException(`Bot with ID ${botId} not found`);
      }

      return {
        success: true,
        data: profile,
      };
    } catch (error) {
      this.logger.error(`Error getting bot profile ${botId}:`, error);
      
      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: `Bot with ID ${botId} not found`,
        data: null as any,
      };
    }
  }

  @Get('search')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Пошук ботів за різними критеріями' })
  @ApiQuery({ name: 'username', required: false, description: 'Пошук по імені' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'] })
  @ApiQuery({ name: 'canVote', required: false, type: Boolean })
  @ApiQuery({ name: 'hasAvatar', required: false, type: Boolean })
  @ApiQuery({ name: 'minActivityCount', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  async searchBots(
    @Query('username') username?: string,
    @Query('status') status?: 'active' | 'inactive',
    @Query('canVote') canVote?: boolean,
    @Query('hasAvatar') hasAvatar?: boolean,
    @Query('minActivityCount') minActivityCount?: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<SearchBotsResponse> {
    try {
      const filters = {
        username,
        status,
        canVote: canVote !== undefined ? canVote === true : undefined,
        hasAvatar: hasAvatar !== undefined ? hasAvatar === true : undefined,
        minActivityCount: minActivityCount ? parseInt(minActivityCount.toString(), 10) : undefined,
        page: page ? parseInt(page.toString(), 10) : 1,
        limit: limit ? parseInt(limit.toString(), 10) : 20,
      };

      const result = await this.botProfileService.searchBots(filters);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error('Error searching bots:', error);
      
      return {
        success: false,
        message: 'Помилка при пошуку ботів',
        data: {
          bots: [],
          total: 0,
          page: 1,
          limit: 20,
          pages: 0,
        },
      };
    }
  }

  @Get('all')
  @UseGuards(InternalSecretGuard)
  @ApiOperation({ summary: 'Отримати всіх ботів (тільки для внутрішнього використання)' })
  async getAllBots(): Promise<GetAllBotsResponse> {
    try {
      const bots = await this.botProfileService.getAllBots();

      return {
        success: true,
        data: bots,
        count: bots.length,
      };
    } catch (error) {
      this.logger.error('Error getting all bots:', error);
      
      return {
        success: false,
        message: 'Помилка при отриманні списку ботів',
        data: [],
        count: 0,
      };
    }
  }

  @Get('stats')
  @UseGuards(InternalSecretGuard)
  @ApiOperation({ summary: 'Статистика по ботам' })
  async getBotsStats(): Promise<GetBotsStatsResponse> {
    try {
      const bots = await this.botProfileService.getAllBots();
      
      const stats = {
        total: bots.length,
        active: bots.filter(b => b.botData.status === 'active').length,
        canVote: bots.filter(b => b.botData.canVote).length,
        hasAvatar: bots.filter(b => b.botData.hasAvatar).length,
        byActivity: {
          high: bots.filter(b => b.botData.activityCount > 100).length,
          medium: bots.filter(b => b.botData.activityCount >= 20 && b.botData.activityCount <= 100).length,
          low: bots.filter(b => b.botData.activityCount < 20).length,
        },
        lastActivity: {
          today: bots.filter(b => {
            const today = new Date();
            const lastActivity = new Date(b.botData.lastActivity);
            return lastActivity.toDateString() === today.toDateString();
          }).length,
          week: bots.filter(b => {
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const lastActivity = new Date(b.botData.lastActivity);
            return lastActivity >= weekAgo;
          }).length,
          month: bots.filter(b => {
            const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const lastActivity = new Date(b.botData.lastActivity);
            return lastActivity >= monthAgo;
          }).length,
        },
      };

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.logger.error('Error getting bots stats:', error);
      
      return {
        success: false,
        message: 'Помилка при отриманні статистики ботів',
        data: null as any,
      };
    }
  }
}