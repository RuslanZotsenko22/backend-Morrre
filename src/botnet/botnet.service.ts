import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BotManagementService } from './services/bot-management.service';
import { BotQueueService } from './services/bot-queue.service';
import { PayloadApiService } from './services/payload-api.service';
import { CuratorAnalyticsService } from './services/curator-analytics.service';
import { VotesService } from '../votes/votes.service'; 
import { NotificationsService } from '../notifications/notifications.service';
import { Case, CaseDocument } from '../cases/schemas/case.schema';

@Injectable()
export class BotnetService {
  private readonly logger = new Logger(BotnetService.name);

  constructor(
    private readonly botManagementService: BotManagementService,
    private readonly botQueueService: BotQueueService,
    private readonly payloadApiService: PayloadApiService,
    private readonly curatorAnalytics: CuratorAnalyticsService,
    private readonly votesService: VotesService, 
    private readonly notificationsService: NotificationsService,
    @InjectModel(Case.name) private caseModel: Model<CaseDocument>,
  ) {}

  /**
   * Генерація нових ботів
   */
  async generateBots(count: number): Promise<{ message: string; count: number }> {
    try {
      this.logger.log(`Starting bots generation for ${count} bots`);
      
      // Генеруємо ботів через BotManagementService
      await this.botManagementService.generateBots(count);
      
      this.logger.log(`Successfully generated ${count} bots`);
      return { 
        message: `Bots generation started for ${count} bots`, 
        count 
      };
    } catch (error) {
      this.logger.error(`Failed to generate bots: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Отримання статистики ботнету
   */
  async getStatistics(): Promise<{
    totalBots: number;
    activeBots: number;
    votingBots: number;
    curatorStats?: {
      ratedCases: number;
      activeCurators: number;
      avgRating: number;
    }
  }> {
    try {
      // Отримуємо ботів з Payload CMS
      const botsResponse = await this.payloadApiService.getBotsFromPayload();
      const bots = botsResponse.docs || [];

      const totalBots = bots.length;
      const activeBots = bots.filter(bot => bot.status === 'active').length;
      const votingBots = bots.filter(bot => bot.canVote).length;

      const result: any = {
        totalBots,
        activeBots,
        votingBots,
      };

      // Додаємо кураторську статистику, якщо можливо
      try {
        const curatorStats = await this.getCuratorStatistics();
        result.curatorStats = curatorStats;
      } catch (error) {
        this.logger.warn(`Не вдалося отримати кураторську статистику: ${error.message}`);
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to get statistics: ${error.message}`);
      // Повертаємо нульову статистику у разі помилки
      return {
        totalBots: 0,
        activeBots: 0,
        votingBots: 0,
      };
    }
  }

  /**
   * Буст активності на кейс/референс
   */
  async boostActivity(
    targetId: string, 
    targetType: 'case' | 'reference' | 'user',
    options?: { useCuratorAnalysis?: boolean }
  ): Promise<void> {
    try {
      this.logger.log(`Boosting activity for ${targetType} with ID: ${targetId}`);
      
      // Аналізуємо реальну активність
      const realActivity = await this.analyzeRealActivity(targetId, targetType);
      
      // Використовуємо кураторський аналіз тільки для кейсів
      const useCuratorAnalysis = options?.useCuratorAnalysis && targetType === 'case';
      
      if (useCuratorAnalysis) {
        this.logger.log(`🎨 Використовую кураторський аналіз для кейсу ${targetId}`);
      }
      
      // Додаємо завдання в чергу на основі реальної активності
      await this.botQueueService.scheduleActivityBoost({
        targetId,
        targetType,
        realActivity,
        useCuratorAnalysis,
      });

      this.logger.log(`Activity boost scheduled for ${targetType} ${targetId}`);
    } catch (error) {
      this.logger.error(`Failed to boost activity: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Буст з кураторським аналізом
   */
  async boostWithCuratorAnalysis(caseId: string): Promise<{
    success: boolean;
    multiplier: number;
    score: number;
    curatorCount: number;
  }> {
    try {
      this.logger.log(`🎨 Запуск бусту з кураторським аналізом для кейсу ${caseId}`);
      
      // Аналізуємо реальну активність
      const realActivity = await this.analyzeRealActivity(caseId, 'case');
      
      // Отримуємо кураторський аналіз
      const { multiplier, score, curatorCount } = await this.curatorAnalytics.getBoostMultiplier(caseId);
      
      // Запускаємо буст з кураторським аналізом
      await this.botQueueService.scheduleActivityBoost({
        targetId: caseId,
        targetType: 'case',
        realActivity,
        useCuratorAnalysis: true,
      });
      
      // Оновлюємо дані про кураторський аналіз в кейсі
      await this.curatorAnalytics.updateCaseCuratorData(
        caseId, 
        multiplier, 
        score, 
        curatorCount
      );
      
      this.logger.log(`🚀 Буст з кураторським аналізом запущено для кейсу ${caseId}`);
      
      return {
        success: true,
        multiplier,
        score,
        curatorCount,
      };
    } catch (error) {
      this.logger.error(`Помилка бусту з кураторським аналізом: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🆕 Буст лайків на референс
   */
  async boostReferenceLikes(referenceId: string, likeCount: number): Promise<void> {
    try {
      this.logger.log(`🚀 Boosting ${likeCount} likes for reference ${referenceId}`);
      
      await this.botQueueService.boostReferenceLikes(referenceId, likeCount);
      
      this.logger.log(`✅ Like boost scheduled for reference ${referenceId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to boost likes for reference ${referenceId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Обробка нового кейсу (автоматичний запуск через 10-20 хвилин)
   */
  async handleNewCase(caseId: string): Promise<void> {
    try {
      // Рандомна затримка 10-20 хвилин
      const delayMinutes = Math.floor(Math.random() * 11) + 10; // 10-20 хвилин
      const delayMs = delayMinutes * 60 * 1000;

      this.logger.log(`Scheduling botnet activity for case ${caseId} in ${delayMinutes} minutes`);

      setTimeout(async () => {
        try {
          // Стандартний буст
          await this.boostActivity(caseId, 'case');
          this.logger.log(`✅ Стандартний буст виконано для кейсу ${caseId}`);
          
          // Запитуємо оцінки у кураторів через 1 годину
          setTimeout(async () => {
            try {
              await this.curatorAnalytics.requestCuratorReviews(caseId);
              this.logger.log(`📨 Запити на оцінку надіслано кураторам для кейсу ${caseId}`);
            } catch (error) {
              this.logger.error(`❌ Помилка запиту оцінок: ${error.message}`);
            }
          }, 60 * 60 * 1000); // 1 година
          
          // Кураторський аналіз та коригування через 24 години
          setTimeout(async () => {
            try {
              await this.boostWithCuratorAnalysis(caseId);
              this.logger.log(`🎨 Кураторський аналіз та коригування застосовано для кейсу ${caseId}`);
            } catch (error) {
              this.logger.error(`❌ Помилка кураторського аналізу: ${error.message}`);
            }
          }, 24 * 60 * 60 * 1000); // 24 години
          
        } catch (error) {
          this.logger.error(`Failed to execute scheduled activity for case ${caseId}: ${error.message}`);
        }
      }, delayMs);

    } catch (error) {
      this.logger.error(`Failed to schedule case activity: ${error.message}`, error.stack);
    }
  }

  /**
   * Аналіз реальної активності для органічного бусту
   */
  private async analyzeRealActivity(targetId: string, targetType: string): Promise<number> {
    try {
      // Для кейсів: аналізуємо перегляди, лайки, коментарі
      if (targetType === 'case') {
        const caseData = await this.caseModel.findById(targetId);
        if (caseData) {
          // Реальна активність = перегляди + лайки + коментарі
          const views = caseData.views || 0;
          const saves = caseData.saves || 0;
          const shares = caseData.shares || 0;
          const refsLikes = caseData.refsLikes || 0;
          
          // Вагова формула: перегляди менш важливі, взаємодії важливіші
          return Math.floor(views * 0.1 + saves * 2 + shares * 3 + refsLikes * 1.5);
        }
      }
      
      // Для референсів: кількість лайків
      if (targetType === 'reference') {
        // Тут потрібно буде додати логіку для отримання лайків референсу
        return Math.floor(Math.random() * 20); // Тимчасово
      }
      
      // Для користувачів: кількість підписників, активність
      if (targetType === 'user') {
        // Тут потрібно буде додати логіку для аналізу активності користувача
        return Math.floor(Math.random() * 30); // Тимчасово
      }
      
      return Math.floor(Math.random() * 50); // Запасний варіант
    } catch (error) {
      this.logger.error(`Помилка аналізу реальної активності: ${error.message}`);
      return Math.floor(Math.random() * 30); // Мінімальна активність
    }
  }

  /**
   * Запис активності бота (для оновлення lastActivity)
   */
  async recordBotActivity(botId: string): Promise<void> {
    try {
      await this.botManagementService.recordBotActivity(botId);
    } catch (error) {
      this.logger.error(`Failed to record bot activity: ${error.message}`);
    }
  }

  /**
   * Отримання налаштувань ботнету
   */
  async getSettings(): Promise<any> {
    try {
      const settings = await this.payloadApiService.getBotnetSettings();
      
      // Додаємо кураторські налаштування за замовчуванням
      const defaultCuratorSettings = {
        enabled: true,
        minCuratorsForAnalysis: 2,
        autoRequestReviews: true,
        reviewRequestDelay: 60,
        boostMultipliers: {
          excellent: 1.5,
          good: 1.25,
          neutral: 1.0,
          bad: 0.75,
          very_bad: 0.5,
        },
      };
      
      return {
        ...settings,
        curatorSettings: settings?.curatorSettings || defaultCuratorSettings,
      };
    } catch (error) {
      this.logger.error(`Failed to get botnet settings: ${error.message}`);
      // Повертаємо дефолтні налаштування у разі помилки
      return {
        timingSettings: {
          minDelay: 2,
          maxDelay: 4,
          caseActivationDelayMin: 10,
          caseActivationDelayMax: 20,
        },
        queueSettings: {
          queues: [
            { minBots: 34, maxBots: 56 },
            { minBots: 57, maxBots: 102 },
            { minBots: 103, maxBots: 231 },
          ],
        },
        curatorSettings: {
          enabled: true,
          minCuratorsForAnalysis: 2,
          autoRequestReviews: true,
          reviewRequestDelay: 60,
          boostMultipliers: {
            excellent: 1.5,
            good: 1.25,
            neutral: 1.0,
            bad: 0.75,
            very_bad: 0.5,
          },
        },
      };
    }
  }

  /**
   * Запуск голосування ботів за кейс
   */
  async handleVoteActivity(caseId: string, voteCount: number): Promise<void> {
    this.logger.log(`🎯 Starting vote activity for case ${caseId} with ${voteCount} bots`);
    
    // Отримуємо ботів, які можуть голосувати (з аватарками)
    const eligibleBots = await this.getEligibleVotingBots(voteCount);
    
    this.logger.log(`🤖 Found ${eligibleBots.length} eligible bots for voting`);
    
    // Створюємо завдання для голосування для кожного бота
    for (const bot of eligibleBots) {
      await this.scheduleVoteTask(bot, caseId);
    }
  }

  /**
   * Отримати ботів, які можуть голосувати (з аватарками)
   */
  private async getEligibleVotingBots(count: number): Promise<any[]> {
    // Використовуємо BotManagementService для отримання ботів з аватарками
    const botsWithAvatars = await this.botManagementService.getBotsWithAvatars(count);
    
    // Фільтруємо ботів, які не голосували за останні 24 години
    const activeBots = botsWithAvatars.filter(bot => {
      const lastVoteTime = bot.lastVoteAt ? new Date(bot.lastVoteAt) : new Date(0);
      const hoursSinceLastVote = (Date.now() - lastVoteTime.getTime()) / (1000 * 60 * 60);
      return hoursSinceLastVote >= 24; // Мінімум 24 години між голосуваннями
    });
    
    return activeBots.slice(0, count);
  }

  /**
   * Запланувати завдання голосування для бота
   */
  private async scheduleVoteTask(bot: any, caseId: string): Promise<void> {
    // Генеруємо випадковий час затримки (від 2 до 4 хвилин)
    const delay = Math.floor(Math.random() * (4 - 2 + 1) + 2) * 60 * 1000;
    
    // Генеруємо випадкові оцінки в діапазоні 7.0-8.5
    const scores = this.generateVoteScores();
    
    // Створюємо завдання в черзі
    await this.botQueueService.addVoteTask({
      botId: bot._id,
      caseId,
      scores,
      delay,
    });

    this.logger.log(`⏰ Scheduled vote for bot ${bot._id} on case ${caseId} in ${delay/1000/60} minutes`);
  }

  /**
   * Генерація випадкових оцінок в діапазоні 7.0-8.5
   */
  private generateVoteScores(): { design: number; creativity: number; content: number } {
    const overall = Math.random() * (8.5 - 7.0) + 7.0;
    
    // Генеруємо три оцінки, які в середньому дадуть бажаний overall
    const base = overall * 3;
    const design = Math.random() * (base / 3) + (base / 3) * 0.5;
    const creativity = Math.random() * (base / 3) + (base / 3) * 0.5;
    const content = base - design - creativity;
    
    return {
      design: Math.round(design * 10) / 10,
      creativity: Math.round(creativity * 10) / 10,
      content: Math.round(content * 10) / 10,
    };
  }

  /**
   * Виконання голосування бота (викликається з черги)
   */
  async performVote(botId: string, caseId: string, scores: { design: number; creativity: number; content: number }): Promise<void> {
    try {
      // Перевіряємо чи бот ще не голосував
      const hasVoted = await this.votesService.didUserVote(caseId, botId);
      if (hasVoted.voted) {
        this.logger.warn(`Bot ${botId} already voted for case ${caseId}`);
        return;
      }
      
      // Виконуємо голосування
      await this.votesService.create(caseId, botId, scores);
      
      // Оновлюємо час останнього голосування бота
      await this.botManagementService.updateBotLastVote(botId);
      
      this.logger.log(`✅ Bot ${botId} voted for case ${caseId} with scores: ${JSON.stringify(scores)}`);
      
    } catch (error) {
      this.logger.error(`❌ Bot ${botId} failed to vote for case ${caseId}: ${error.message}`);
    }
  }

  /**
   * Додаємо метод для створення сповіщень про активність ботів
   */
  private async createBotActivityNotification(
    botId: string,
    activityType: string,
    targetUserId: string,
    metadata: any
  ): Promise<void> {
    try {
      await this.notificationsService.create({
        recipient: targetUserId,
        actor: botId,
        type: activityType,
        metadata,
      });
    } catch (error) {
      console.error('Помилка створення сповіщення:', error);
    }
  }

  /**
   * Модифікуємо існуючі методи, наприклад для голосування:
   */
  async simulateVoteActivity(caseId: string, botId: string, score: number): Promise<void> {
    const caseData = await this.caseModel.findById(caseId);
    
    if (!caseData) {
      throw new Error('Кейс не знайдено');
    }

    // Створюємо об'єкт scores для votesService
    const scores = {
      design: score,
      creativity: score,
      content: score,
    };

    // Виконуємо голосування через votesService
    await this.votesService.create(caseId, botId, scores);

    // Створюємо сповіщення для власника кейсу
    await this.createBotActivityNotification(
      botId,
      'VOTE',
      caseData.ownerId.toString(),
      {
        caseId,
        voteScore: score
      }
    );
  }

  /**
   * Отримати кураторську статистику
   */
  private async getCuratorStatistics(): Promise<{
    ratedCases: number;
    activeCurators: number;
    avgRating: number;
  }> {
    try {
      // Це тимчасова реалізація
      // У реальному проекті тут буде запит до Payload для отримання статистики кураторів
      return {
        ratedCases: 0,
        activeCurators: 0,
        avgRating: 1.0,
      };
    } catch (error) {
      this.logger.error(`Помилка отримання кураторської статистики: ${error.message}`);
      return {
        ratedCases: 0,
        activeCurators: 0,
        avgRating: 1.0,
      };
    }
  }

  /**
   * Аналіз кейсу з кураторами
   */
  async analyzeWithCurators(caseId: string): Promise<{
    multiplier: number;
    score: number;
    curatorCount: number;
    quality: any;
    recommendations: string[];
  }> {
    try {
      return await this.curatorAnalytics.analyzeWithCurators(caseId);
    } catch (error) {
      this.logger.error(`Помилка аналізу кейсу з кураторами: ${error.message}`);
      throw error;
    }
  }

  /**
   * Запит оцінок у кураторів
   */
  async requestCuratorReviews(caseId: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.curatorAnalytics.requestCuratorReviews(caseId);
      return {
        success: true,
        message: `Запити на оцінку надіслано кураторам для кейсу ${caseId}`,
      };
    } catch (error) {
      this.logger.error(`Помилка запиту оцінок: ${error.message}`);
      throw error;
    }
  }

  /**
   * Отримати якість контенту на основі кураторських оцінок
   */
  async getContentQuality(caseId: string): Promise<{
    quality: 'high' | 'medium' | 'low';
    aspects: {
      design: number;
      creativity: number;
      execution: number;
    };
    recommendations: string[];
  }> {
    try {
      return await this.curatorAnalytics.analyzeContentQuality(caseId);
    } catch (error) {
      this.logger.error(`Помилка отримання якості контенту: ${error.message}`);
      throw error;
    }
  }

  /**
   * Отримати інформацію про кураторський вплив
   */
  async getCuratorImpact(caseId: string): Promise<{
    multiplier: number;
    score: number;
    curatorCount: number;
    rating: string;
  }> {
    try {
      const { multiplier, score, curatorCount } = await this.curatorAnalytics.getBoostMultiplier(caseId);
      
      // Конвертуємо числовий бал в текстову оцінку
      let rating = 'neutral';
      if (score >= 1.3) rating = 'excellent';
      else if (score >= 1.1) rating = 'good';
      else if (score >= 0.9) rating = 'neutral';
      else if (score >= 0.7) rating = 'bad';
      else rating = 'very_bad';
      
      return {
        multiplier,
        score,
        curatorCount,
        rating,
      };
    } catch (error) {
      this.logger.error(`Помилка отримання кураторського впливу: ${error.message}`);
      throw error;
    }
  }

  /**
   * Застосувати кураторський буст (запит оцінок + планування бусту через 24 години)
   */
  async applyCuratorBoost(caseId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Запитуємо оцінки у кураторів
      await this.requestCuratorReviews(caseId);
      
      // Плануємо буст через 24 години
      setTimeout(async () => {
        try {
          await this.boostWithCuratorAnalysis(caseId);
          this.logger.log(`✅ Кураторський буст виконано для кейсу ${caseId}`);
        } catch (error) {
          this.logger.error(`❌ Помилка виконання кураторського бусту: ${error.message}`);
        }
      }, 24 * 60 * 60 * 1000);
      
      return {
        success: true,
        message: 'Curator analysis requested, boost scheduled in 24h',
      };
    } catch (error) {
      this.logger.error(`Помилка застосування кураторського бусту: ${error.message}`);
      throw error;
    }
  }
}