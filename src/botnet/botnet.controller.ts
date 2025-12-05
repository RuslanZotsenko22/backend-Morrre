import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Query, 
  Logger, 
  HttpException, 
  HttpStatus, 
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Delete 
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { BotManagementService } from './services/bot-management.service';
import { BotQueueService } from './services/bot-queue.service';
import { BotnetService } from './botnet.service';
import { BotHealthMonitorService } from './services/bot-health-monitor.service';
import { AvatarDistributionService } from './services/avatar-distribution.service';
import { InternalSecretGuard } from '../common/guards/internal-secret.guard';
import { PayloadApiService } from './services/payload-api.service';

// Тип для аватарки (додаємо тут, щоб уникнути проблем з експортом)
interface BotAvatar {
  id: string;
  filename: string;
  url: string;
  assignedToBot?: {
    id: string;
    collection: string;
  };
  isAssigned: boolean;
}

@Controller('botnet')
@ApiTags('Botnet')
export class BotnetController {
  private readonly logger = new Logger(BotnetController.name);

  constructor(
    private botManagementService: BotManagementService,
    private botQueueService: BotQueueService,
    private botnetService: BotnetService, 
    private readonly botHealthMonitorService: BotHealthMonitorService,
    private readonly avatarDistributionService: AvatarDistributionService,
    private readonly payloadApiService: PayloadApiService,
  ) {}

  @Post('generate-bots')
  @ApiOperation({ summary: 'Генерація нових ботів' })
  async generateBots(@Body() body: { count: number }) {
    try {
      this.logger.log(`Received request to generate ${body.count} bots`);
      
      if (!body.count || typeof body.count !== 'number' || body.count < 1) {
        throw new HttpException(
          'Count must be a positive number',
          HttpStatus.BAD_REQUEST
        );
      }

      if (body.count > 1000) {
        throw new HttpException(
          'Cannot generate more than 1000 bots at once',
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.botnetService.generateBots(body.count);
      
      this.logger.log(`Successfully generated ${body.count} bots`);
      return result;
      
    } catch (error) {
      this.logger.error(`Failed to generate bots: ${error.message}`, error.stack);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        'Internal server error during bot generation',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('boost-reference-likes')
  @ApiOperation({ summary: 'Буст лайків на референс' })
  async boostReferenceLikes(
    @Body() dto: { referenceId: string; likeCount: number }
  ) {
    try {
      await this.botQueueService.boostReferenceLikes(dto.referenceId, dto.likeCount);
      
      return {
        success: true,
        message: `Like boost scheduled for reference ${dto.referenceId} with ${dto.likeCount} likes`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to schedule like boost: ${error.message}`
      };
    }
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Отримати статистику ботнету' })
  async getStatistics() {
    try {
      this.logger.log('Fetching botnet statistics');
      
      return await this.botnetService.getStatistics();
      
    } catch (error) {
      this.logger.error(`Failed to get statistics: ${error.message}`);
      
      return {
        totalBots: 0,
        activeBots: 0,
        votingBots: 0,
      };
    }
  }

  @Get('health')
  @ApiOperation({ summary: 'Перевірка здоров\'я системи ботнету' })
  async getHealth() {
    try {
      const stats = await this.botnetService.getStatistics();
      const settings = await this.botnetService.getSettings();
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        statistics: stats,
        settings: settings ? 'loaded' : 'default',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  @Get('health/stats')
  @ApiOperation({ summary: 'Детальна статистика здоров\'я ботів' })
  async getBotHealthStats() {
    return this.botHealthMonitorService.getDetailedBotStats();
  }

  @Post('health/check-now')
  @ApiOperation({ summary: 'Примусова перевірка здоров\'я ботів' })
  async triggerHealthCheck() {
    const result = await this.botHealthMonitorService.checkAllBotsHealth();
    return { 
      message: 'Перевірка здоровʼя запущена',
      result 
    };
  }

  @Post('bot/:id/force-activity')
  @ApiOperation({ summary: 'Примусова активність бота' })
  async forceBotActivity(@Param('id') botId: string) {
    const success = await this.botHealthMonitorService.forceBotActivity(botId);
    return { 
      success,
      message: success ? 'Активність успішно оновлено' : 'Помилка оновлення активності'
    };
  }

  @Get('health/status')
  @ApiOperation({ summary: 'Загальний статус системи' })
  async getSystemHealth() {
    const stats = await this.botHealthMonitorService.getDetailedBotStats();
    return {
      status: stats.healthStatus,
      activeBots: stats.activeBots,
      totalBots: stats.totalBots,
      healthPercentage: Math.round((stats.activeBots / stats.totalBots) * 100),
      lastUpdate: new Date()
    };
  }

  // ========== ЕНДПОІНТИ ДЛЯ АВАТАРОК ==========

  @Post('avatars/distribute')
  @UseGuards(InternalSecretGuard)
  @ApiOperation({ summary: 'Розподілити аватарки по ботах' })
  async distributeAvatars() {
    try {
      this.logger.log('Starting avatar distribution...');
      
      const result = await this.avatarDistributionService.distributeAvatars();
      
      this.logger.log(`Successfully distributed ${result.distributed} avatars`);
      
      return {
        success: true,
        message: `Успішно розподілено ${result.distributed} аватарок`,
        data: result
      };
    } catch (error) {
      this.logger.error('Error distributing avatars:', error);
      
      throw new HttpException(
        `Помилка розподілу аватарок: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('avatars/status')
  @UseGuards(InternalSecretGuard)
  @ApiOperation({ summary: 'Статус аватарок ботів' })
  async getAvatarStatus() {
    try {
      const status = await this.avatarDistributionService.checkAvatarStatus();
      
      return {
        success: true,
        data: status
      };
    } catch (error) {
      this.logger.error('Error getting avatar status:', error);
      
      throw new HttpException(
        `Помилка отримання статусу аватарок: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('avatars/reset')
  @UseGuards(InternalSecretGuard)
  @ApiOperation({ summary: 'Скинути призначення аватарок' })
  async resetAvatars() {
    try {
      this.logger.log('Resetting avatar assignments...');
      
      const result = await this.avatarDistributionService.resetAvatarAssignments();
      
      this.logger.log(`Successfully reset ${result.reset} avatar assignments`);
      
      return {
        success: true,
        message: `Успішно скинуто призначення ${result.reset} аватарок`,
        data: result
      };
    } catch (error) {
      this.logger.error('Error resetting avatar assignments:', error);
      
      throw new HttpException(
        `Помилка скидання призначення аватарок: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('avatars/upload')
  @UseGuards(InternalSecretGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Завантажити нову аватарку' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadAvatar(@UploadedFile() file: Express.Multer.File): Promise<{ success: boolean; message: string; data: BotAvatar }> {
    try {
      if (!file) {
        throw new HttpException(
          'Файл не було завантажено',
          HttpStatus.BAD_REQUEST
        );
      }

      this.logger.log(`Uploading avatar: ${file.originalname} (${file.size} bytes)`);
      
      const avatar = await this.payloadApiService.uploadBotAvatar(file);
      
      if (!avatar) {
        throw new HttpException(
          'Не вдалося завантажити аватарку',
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }

      this.logger.log(`Successfully uploaded avatar: ${avatar.id}`);
      
      return {
        success: true,
        message: 'Аватарку успішно завантажено',
        data: avatar
      };
    } catch (error) {
      this.logger.error('Error uploading avatar:', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        `Помилка завантаження аватарки: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Delete('avatars/:id')
  @UseGuards(InternalSecretGuard)
  @ApiOperation({ summary: 'Видалити аватарку' })
  async deleteAvatar(@Param('id') id: string) {
    try {
      this.logger.log(`Deleting avatar: ${id}`);
      
      const success = await this.payloadApiService.deleteBotAvatar(id);
      
      if (!success) {
        throw new HttpException(
          'Не вдалося видалити аватарку',
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }

      this.logger.log(`Successfully deleted avatar: ${id}`);
      
      return {
        success: true,
        message: 'Аватарку успішно видалено'
      };
    } catch (error) {
      this.logger.error(`Error deleting avatar ${id}:`, error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        `Помилка видалення аватарки: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}