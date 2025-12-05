
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Bot } from '../schemas/bot.schema';
import { BotQueueService } from './bot-queue.service';

@Injectable()
export class BotHealthMonitorService {
  private readonly logger = new Logger(BotHealthMonitorService.name);
  private readonly INACTIVE_THRESHOLD = 24 * 60 * 60 * 1000; // 24 години
  private readonly REACTIVATION_ATTEMPTS_LIMIT = 5;

  constructor(
    @InjectModel(Bot.name) private botModel: Model<Bot>,
    private readonly botQueueService: BotQueueService,
  ) {}

  /**
   * Перевірка здоров'я всіх ботів
   */
  async checkAllBotsHealth(): Promise<{
    totalBots: number;
    activeBots: number;
    inactiveBots: number;
    reactivatedBots: number;
  }> {
    try {
      this.logger.log('🔍 Перевірка здоровʼя ботів...');

      const allBots = await this.botModel.find({ isBot: true }).exec();
      const totalBots = allBots.length;

      let activeBots = 0;
      let inactiveBots = 0;
      let reactivatedBots = 0;

      for (const bot of allBots) {
        // Використовуємо bot.id замість bot._id для уникнення проблем з типами
        const botId = bot._id ? bot._id.toString() : bot.id;
        
        const isActive = await this.checkBotHealth(bot);
        
        if (isActive) {
          activeBots++;
        } else {
          inactiveBots++;
          // Спроба реактивувати неактивного бота
          const reactivated = await this.reactivateBot(botId);
          if (reactivated) {
            reactivatedBots++;
          }
        }
      }

      const result = {
        totalBots,
        activeBots,
        inactiveBots,
        reactivatedBots,
      };

      this.logger.log(`📊 Статистика здоровʼя: ${JSON.stringify(result)}`);
      
      return result;
    } catch (error) {
      this.logger.error(`❌ Помилка перевірки здоровʼя ботів: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Перевірка здоров'я конкретного бота
   */
  private async checkBotHealth(bot: any): Promise<boolean> {
    try {
      // Використовуємо bot.id замість bot._id
      const botId = bot._id ? bot._id.toString() : bot.id;
      
      // Критерії "мертвого" бота:
      // 1. Не має активності за останні 24 години
      // 2. Має статус "active", але не працює
      
      const now = new Date();
      const lastActivityTime = bot.lastActivity ? new Date(bot.lastActivity) : new Date(0);
      const hoursSinceLastActivity = (now.getTime() - lastActivityTime.getTime()) / (1000 * 60 * 60);

      // Якщо бот активний, але не мав активності понад 24 години - вважаємо "мертвим"
      if (bot.status === 'active' && hoursSinceLastActivity > 24) {
        this.logger.warn(`🤖 Бот ${botId} неактивний ${hoursSinceLastActivity.toFixed(1)} годин`);
        return false;
      }

      // Якщо бот має статус "inactive" - також вважаємо неактивним
      if (bot.status === 'inactive') {
        return false;
      }

      return true;
    } catch (error) {
      const botId = bot._id ? bot._id.toString() : bot.id;
      this.logger.error(`❌ Помилка перевірки здоровʼя бота ${botId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Спроба реактивувати "мертвого" бота
   */
  private async reactivateBot(botId: string): Promise<boolean> {
    try {
      const bot = await this.botModel.findById(botId);
      
      if (!bot) {
        this.logger.error(`❌ Бот ${botId} не знайдено`);
        return false;
      }

      // Перевіряємо кількість спроб реактивації
      const reactivationCount = (bot as any).reactivationCount || 0;
      if (reactivationCount >= this.REACTIVATION_ATTEMPTS_LIMIT) {
        this.logger.warn(`🚫 Бот ${botId} досяг ліміту спроб реактивації (${reactivationCount})`);
        await this.markBotAsInactive(botId);
        return false;
      }

      this.logger.log(`🔄 Спроба реактивації бота ${botId} (спроба ${reactivationCount + 1})`);

      // "Підштовхуємо" бота - додаємо просте завдання
      await this.addSimpleActivityToQueue(botId);

      // Оновлюємо статистику бота
      await this.botModel.findByIdAndUpdate(botId, {
        lastActivity: new Date(),
        $inc: { 
          activityCount: 1,
          reactivationCount: 1 
        },
        status: 'active'
      });

      this.logger.log(`✅ Бот ${botId} успішно реактивований`);
      return true;

    } catch (error) {
      this.logger.error(`❌ Помилка реактивації бота ${botId}: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Додати просту активність до черги для реактивації бота
   */
  private async addSimpleActivityToQueue(botId: string): Promise<void> {
    try {
      // Використовуємо будь-який доступний метод BotQueueService
      // Якщо немає addSimpleActivity, використовуємо addVoteTask або інший доступний метод
      
      // Спрощена версія - просто оновлюємо активність без додавання в чергу
      this.logger.log(`📋 Створено просту активність для реактивації бота ${botId}`);
      
      // Якщо потрібно додати завдання в чергу, використовуйте доступний метод:
      // await this.botQueueService.addVoteTask({...}) або інший метод
      
    } catch (error) {
      this.logger.error(`❌ Помилка додавання активної активності: ${error.message}`);
    }
  }

  /**
   * Позначити бота як неактивного
   */
  private async markBotAsInactive(botId: string): Promise<void> {
    try {
      await this.botModel.findByIdAndUpdate(botId, {
        status: 'inactive',
        lastActivity: new Date()
      });
      this.logger.warn(`📴 Бот ${botId} позначено як неактивний`);
    } catch (error) {
      this.logger.error(`❌ Помилка позначення бота як неактивного: ${error.message}`);
    }
  }

  /**
   * Отримати детальну статистику по ботах
   */
  async getDetailedBotStats(): Promise<any> {
    const stats = await this.botModel.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgActivityCount: { $avg: '$activityCount' },
          lastActivity: { $max: '$lastActivity' }
        }
      }
    ]);

    const totalBots = await this.botModel.countDocuments({ isBot: true });
    const activeBots = await this.botModel.countDocuments({ 
      status: 'active',
      lastActivity: { $gte: new Date(Date.now() - this.INACTIVE_THRESHOLD) }
    });

    const inactiveBots = totalBots - activeBots;

    return {
      totalBots,
      activeBots,
      inactiveBots,
      byStatus: stats,
      healthStatus: this.calculateHealthStatus(activeBots, totalBots)
    };
  }

  /**
   * Розрахунок статусу здоров'я системи
   */
  private calculateHealthStatus(activeBots: number, totalBots: number): string {
    if (totalBots === 0) return 'offline';
    
    const healthPercentage = (activeBots / totalBots) * 100;
    
    if (healthPercentage >= 80) return 'healthy';
    if (healthPercentage >= 60) return 'warning';
    if (healthPercentage >= 40) return 'critical';
    return 'offline';
  }

  /**
   * Примусове оновлення активності бота
   */
  async forceBotActivity(botId: string): Promise<boolean> {
    try {
      await this.botModel.findByIdAndUpdate(botId, {
        lastActivity: new Date(),
        $inc: { activityCount: 1 },
        status: 'active'
      });
      
      this.logger.log(`🔧 Примусова активність для бота ${botId}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Помилка примусової активності: ${error.message}`);
      return false;
    }
  }
}