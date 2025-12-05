// src/botnet/services/bot-queue.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BotQueue, BotTaskType, BotTaskPriority } from '../schemas/bot-queue.schema';
import { Bot } from '../schemas/bot.schema';
import { PayloadApiService } from './payload-api.service';
import { CommentGeneratorService } from './comment-generator.service';
import { CommentsService } from '../../comments/comments.service';
import { LikesService } from '../../likes/likes.service';
import { FollowsService } from '../../follows/follows.service'; 
import { ReferenceManagementService } from './reference-management.service';
import { CuratorAnalyticsService } from './curator-analytics.service';

@Injectable()
export class BotQueueService {
  private readonly logger = new Logger(BotQueueService.name);

  constructor(
    @InjectModel(BotQueue.name) private botQueueModel: Model<BotQueue>,
    @InjectModel(Bot.name) private botModel: Model<Bot>,
    private payloadApiService: PayloadApiService,
    private commentGenerator: CommentGeneratorService,
    private commentsService: CommentsService,
    private likesService: LikesService,
    private followsService: FollowsService, 
    private readonly referenceManagementService: ReferenceManagementService,
    private readonly curatorAnalytics: CuratorAnalyticsService,
  ) {}

  async addTaskToQueue(taskData: {
    botId: string;
    actionType: string;
    targetType: string;
    targetId: string;
    priority?: BotTaskPriority;
  }): Promise<void> {
    const { botId, actionType, targetType, targetId, priority = BotTaskPriority.MEDIUM } = taskData;

    // Генеруємо затримку 2-4 хвилини
    const delay = this.getRandomDelay(2, 4);
    const scheduledFor = new Date(Date.now() + delay * 60000);

    // Додаємо завдання в чергу в Payload CMS
    await this.payloadApiService.addToQueue({
      bot: botId,
      actionType,
      targetType,
      targetId,
      scheduledFor,
      status: 'pending',
    });

    // Додаємо завдання в локальну базу даних
    await this.botQueueModel.create({
      bot: botId,
      actionType,
      targetType,
      targetId,
      scheduledFor,
      status: 'pending',
      priority,
    });

    this.logger.log(`✅ Task added to queue: ${actionType} for ${targetType} ${targetId}`);
  }

  private getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async getPendingTasks(): Promise<BotQueue[]> {
    return this.botQueueModel
      .find({ status: 'pending', scheduledFor: { $lte: new Date() } })
      .populate('bot')
      .sort({ priority: -1, scheduledFor: 1 })
      .limit(10)
      .exec();
  }

  async markTaskAsCompleted(taskId: string): Promise<void> {
    await this.botQueueModel.findByIdAndUpdate(taskId, {
      status: 'completed',
      lastAttempt: new Date(),
    });
  }

  async markTaskAsFailed(taskId: string, errorMessage: string): Promise<void> {
    await this.botQueueModel.findByIdAndUpdate(taskId, {
      status: 'failed',
      lastAttempt: new Date(),
      errorMessage,
      $inc: { attempts: 1 },
    });
  }

  // Буст активності з чергами 34-349 ботів
  async scheduleActivityBoost(data: {
    targetId: string;
    targetType: string;
    realActivity: number;
    useCuratorAnalysis?: boolean; // Додаємо новий параметр
  }): Promise<void> {
    const { targetId, targetType, realActivity, useCuratorAnalysis = false } = data;
    
    // Якщо потрібен кураторський аналіз, використовуємо новий метод
    if (useCuratorAnalysis && targetType === 'case') {
      return await this.scheduleCuratorAdjustedBoost(data);
    }
    
    // Інакше використовуємо стару логіку
    const queueSizes = this.calculateQueueSizes(realActivity);
    
    for (const queue of queueSizes) {
      const botCount = this.getRandomCount(queue.minBots, queue.maxBots);
      const eligibleBots = await this.getEligibleBots(botCount);
      
      for (const bot of eligibleBots) {
        const actionType = this.getRandomActionType(targetType);
        const priority = this.getPriorityForActionType(actionType);
        
        await this.addTaskToQueue({
          botId: bot.id,
          actionType,
          targetType,
          targetId,
          priority,
        });
      }
    }
  }

  /**
   * Буст активності з урахуванням кураторського аналізу
   */
  async scheduleCuratorAdjustedBoost(data: {
    targetId: string;
    targetType: string;
    realActivity: number;
  }): Promise<void> {
    const { targetId, targetType, realActivity } = data;
    
    let queueSizes = this.calculateQueueSizes(realActivity);
    
    // Застосовуємо кураторський аналіз для кейсу
    if (targetType === 'case') {
      try {
        queueSizes = await this.curatorAnalytics.applyCuratorBoostToActivity(targetId, queueSizes);
        
        // Оновлюємо дані кураторського аналізу в кейсі
        const { multiplier, score, curatorCount } = await this.curatorAnalytics.getBoostMultiplier(targetId);
        await this.curatorAnalytics.updateCaseCuratorData(targetId, multiplier, score, curatorCount);
        
        this.logger.log(`🎨 Застосовано кураторський буст для кейсу ${targetId}: множник ${multiplier}x`);
      } catch (error) {
        this.logger.error(`Помилка кураторського аналізу для кейсу ${targetId}: ${error.message}`);
        // Продовжуємо зі стандартними чергами
      }
    }
    
    for (const queue of queueSizes) {
      const botCount = this.getRandomCount(queue.minBots, queue.maxBots);
      const eligibleBots = await this.getEligibleBots(botCount);
      
      for (const bot of eligibleBots) {
        const actionType = this.getRandomActionType(targetType);
        const priority = this.getPriorityForActionType(actionType);
        
        await this.addTaskToQueue({
          botId: bot.id,
          actionType,
          targetType,
          targetId,
          priority,
        });
      }
    }
  }

  private calculateQueueSizes(realActivity: number): Array<{minBots: number, maxBots: number}> {
    if (realActivity < 10) {
      return [{ minBots: 34, maxBots: 56 }];
    } else if (realActivity < 50) {
      return [
        { minBots: 34, maxBots: 56 },
        { minBots: 57, maxBots: 102 }
      ];
    } else {
      return [
        { minBots: 34, maxBots: 56 },
        { minBots: 57, maxBots: 102 },
        { minBots: 103, maxBots: 231 }
      ];
    }
  }

  private async getEligibleBots(count: number): Promise<Bot[]> {
    // Перевіряємо останню активність (не більше 2 годин тому)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    
    return this.botModel
      .find({ 
        status: 'active',
        lastActivity: { $lt: twoHoursAgo }
      })
      .limit(count)
      .exec();
  }

  private getRandomCount(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private getRandomActionType(targetType: string): string {
    const actions = {
      case: [BotTaskType.VOTE, BotTaskType.FOLLOW], // 🆕 FOLLOW для кейсів
      reference: [BotTaskType.LIKE, BotTaskType.COMMENT, 'take_reference'],
      user: [BotTaskType.FOLLOW] // 🆕 FOLLOW для користувачів
    };

    const availableActions = actions[targetType] || ['subscribe'];
    return availableActions[Math.floor(Math.random() * availableActions.length)];
  }

  // МЕТОД ДЛЯ ВИЗНАЧЕННЯ ПРІОРИТЕТУ
  private getPriorityForActionType(actionType: string): BotTaskPriority {
    const priorityMap = {
      [BotTaskType.VOTE]: BotTaskPriority.HIGH,
      [BotTaskType.FOLLOW]: BotTaskPriority.MEDIUM,
      [BotTaskType.LIKE]: BotTaskPriority.MEDIUM,
      [BotTaskType.COMMENT]: BotTaskPriority.LOW,
      'subscribe': BotTaskPriority.LOW,
      'take_reference': BotTaskPriority.LOW
    };

    return priorityMap[actionType] || BotTaskPriority.MEDIUM;
  }

  // НОВІ МЕТОДИ ДЛЯ ГОЛОСУВАННЯ

  /**
   * Додати завдання голосування в чергу
   */
  async addVoteTask(task: { 
    botId: string; 
    caseId: string; 
    scores: { design: number; creativity: number; content: number };
    delay: number;
  }): Promise<void> {
    const scheduledFor = new Date(Date.now() + task.delay);

    // Використовуємо ENUM ТА ПРІОРИТЕТ
    await this.botQueueModel.create({
      bot: task.botId,
      actionType: BotTaskType.VOTE,
      targetType: 'case',
      targetId: task.caseId,
      scheduledFor,
      status: 'pending',
      payload: {
        scores: task.scores
      },
      priority: BotTaskPriority.HIGH
    });

    // Також додаємо в Payload CMS, якщо потрібно
    await this.payloadApiService.addToQueue({
      bot: task.botId,
      actionType: 'vote',
      targetType: 'case',
      targetId: task.caseId,
      scheduledFor,
      status: 'pending',
    });

    this.logger.log(`✅ Vote task added for bot ${task.botId} on case ${task.caseId}`);
  }

  // МЕТОДИ ДЛЯ ОБРОБКИ КОМЕНТАРІВ

  /**
   * Обробка задачі коментування
   */
  async processCommentTask(task: BotQueue): Promise<void> {
    try {
      this.logger.log(`💬 Processing comment task for bot ${task.bot} on ${task.targetType} ${task.targetId}`);

      // Використовуємо type assertion для _id
      const taskId = (task._id as Types.ObjectId).toString();

      // Перевіряємо, чи не коментував уже бот цей контент
      const hasCommented = await this.commentsService.hasBotCommented(
        task.bot.toString(),
        task.targetId
      );

      if (hasCommented) {
        this.logger.warn(`Bot ${task.bot} already commented on ${task.targetType} ${task.targetId}`);
        await this.markTaskAsCompleted(taskId);
        return;
      }

      // Генеруємо коментар
      let commentText: string;
      if (task.targetType === 'reference') {
        commentText = this.commentGenerator.generateCommentForReference();
      } else {
        commentText = this.commentGenerator.generateCommentForCase();
      }

      // Створюємо коментар в базі даних
      await this.commentsService.createBotComment({
        userId: task.bot.toString(),
        targetId: task.targetId,
        targetType: task.targetType as 'case' | 'reference',
        text: commentText,
      });

      // Відзначаємо задачу як виконану
      await this.markTaskAsCompleted(taskId);

      this.logger.log(`✅ Bot ${task.bot} successfully commented on ${task.targetType} ${task.targetId}`);

    } catch (error) {
      const taskId = (task._id as Types.ObjectId).toString();
      this.logger.error(`❌ Failed to process comment task ${taskId}: ${error.message}`);
      await this.markTaskAsFailed(taskId, error.message);
    }
  }

  // МЕТОДИ ДЛЯ ОБРОБКИ ЛАЙКІВ

  /**
   * Обробка задачі лайку
   */
  async processLikeTask(task: BotQueue): Promise<void> {
    try {
      this.logger.log(`❤️ Processing like task for bot ${task.bot} on ${task.targetType} ${task.targetId}`);

      const taskId = (task._id as Types.ObjectId).toString();

      // Перевіряємо, чи не вже ставив бот лайк цьому контенту
      const hasLiked = await this.likesService.hasBotLiked(
        task.bot.toString(),
        task.targetId
      );

      if (hasLiked) {
        this.logger.warn(`Bot ${task.bot} already liked ${task.targetType} ${task.targetId}`);
        await this.markTaskAsCompleted(taskId);
        return;
      }

      // Створюємо лайк в базі даних
      await this.likesService.createBotLike({
        userId: task.bot.toString(),
        targetId: task.targetId,
        targetType: task.targetType as 'case' | 'reference',
      });

      // Відзначаємо задачу як виконану
      await this.markTaskAsCompleted(taskId);

      this.logger.log(`✅ Bot ${task.bot} successfully liked ${task.targetType} ${task.targetId}`);

    } catch (error) {
      const taskId = (task._id as Types.ObjectId).toString();
      this.logger.error(`❌ Failed to process like task ${taskId}: ${error.message}`);
      await this.markTaskAsFailed(taskId, error.message);
    }
  }

  // 🆕 МЕТОДИ ДЛЯ ОБРОБКИ ПІДПИСОК

  /**
   * Обробка задачі підписки
   */
  async processFollowTask(task: BotQueue): Promise<void> {
    try {
      this.logger.log(`👤 Processing follow task for bot ${task.bot} on user ${task.targetId}`);

      const taskId = (task._id as Types.ObjectId).toString();

      // Перевіряємо, чи не вже підписаний бот на цього користувача
      const hasFollowed = await this.followsService.hasBotFollowed(
        task.bot.toString(),
        task.targetId
      );

      if (hasFollowed) {
        this.logger.warn(`Bot ${task.bot} already followed user ${task.targetId}`);
        await this.markTaskAsCompleted(taskId);
        return;
      }

      // Створюємо підписку в базі даних
      const followResult = await this.followsService.createBotFollow({
        followerId: task.bot.toString(),
        followingId: task.targetId,
      });

      // Перевіряємо чи підписка створилась (може бути null при дублікаті)
      if (followResult) {
        this.logger.log(`✅ Bot ${task.bot} successfully followed user ${task.targetId}`);
      } else {
        this.logger.warn(`⚠️ Bot ${task.bot} follow was skipped (already following)`);
      }

      // Відзначаємо задачу як виконану в будь-якому випадку
      await this.markTaskAsCompleted(taskId);

    } catch (error) {
      const taskId = (task._id as Types.ObjectId).toString();
      this.logger.error(`❌ Failed to process follow task ${taskId}: ${error.message}`);
      await this.markTaskAsFailed(taskId, error.message);
    }
  }

  /**
   * Буст лайків на референс
   */
  async boostReferenceLikes(referenceId: string, likeCount: number): Promise<void> {
    try {
      // Отримуємо випадкових ботів для лайків
      const eligibleBots = await this.getEligibleBots(likeCount);
      const botIds = eligibleBots.map(bot => (bot._id as Types.ObjectId).toString());

      // Створюємо лайки
      await this.likesService.createMultipleBotLikes(
        botIds,
        referenceId,
        'reference'
      );

      this.logger.log(`🚀 Boosted ${likeCount} likes for reference ${referenceId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to boost reference likes: ${error.message}`);
      throw error;
    }
  }

  /**
   * Буст підписок на користувача
   */
  async boostUserFollows(userId: string, followCount: number): Promise<void> {
    try {
      // Отримуємо випадкових ботів для підписок
      const eligibleBots = await this.getEligibleBots(followCount);
      const botIds = eligibleBots.map(bot => (bot._id as Types.ObjectId).toString());

      // Створюємо підписки
      await this.followsService.createMultipleBotFollows(botIds, userId);

      this.logger.log(`🚀 Boosted ${followCount} follows for user ${userId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to boost user follows: ${error.message}`);
      throw error;
    }
  }

  /**
   * Розподіл підписок на кейс
   */
  async distributeCaseFollows(caseId: string, caseData: any, followCount: number): Promise<void> {
    try {
      // Отримуємо випадкових ботів для підписок
      const eligibleBots = await this.getEligibleBots(followCount);
      const botIds = eligibleBots.map(bot => (bot._id as Types.ObjectId).toString());

      // Розподіляємо підписки між власником та учасниками
      await this.followsService.distributeFollows(botIds, caseData);

      this.logger.log(`📊 Distributed ${followCount} follows for case ${caseId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to distribute case follows: ${error.message}`);
      throw error;
    }
  }

  // ЄДИНИЙ МЕТОД ДЛЯ ОБРОБКИ ВСІХ ЗАВДАНЬ

  /**
   * Обробка всіх задач з черги
   */
  async processPendingTasks(): Promise<void> {
    try {
      const pendingTasks = await this.getPendingTasks();
      
      for (const task of pendingTasks) {
        // Використовуємо type assertion для _id
        const taskId = (task._id as Types.ObjectId).toString();

        switch (task.actionType) {
          case BotTaskType.COMMENT:
            await this.processCommentTask(task);
            break;
          
          case BotTaskType.VOTE:
            // TODO: Додати обробку голосування
            this.logger.log(`🗳️ Vote task processing not implemented yet for task ${taskId}`);
            await this.markTaskAsCompleted(taskId);
            break;
          
          case BotTaskType.LIKE:
            await this.processLikeTask(task);
            break;
          
          case BotTaskType.FOLLOW:
            await this.processFollowTask(task); // 🆕 ОБРОБКА ПІДПИСОК
            break;
          
          default:
            this.logger.warn(`❓ Unknown task type: ${task.actionType} for task ${taskId}`);
            await this.markTaskAsCompleted(taskId);
        }
      }
    } catch (error) {
      this.logger.error(`❌ Failed to process pending tasks: ${error.message}`);
    }
  }
  
  /**
   * Запустити процес призначення референсів ботам
   */
  async scheduleReferenceAssignment(): Promise<void> {
    try {
      this.logger.log('Запуск призначення референсів ботам...');
      await this.referenceManagementService.assignRandomReferences();
    } catch (error) {
      this.logger.error(`Помилка при призначенні референсів: ${error.message}`, error.stack);
    }
  }
  
  /**
   * Додати просту активність для "підштовхування" ботів
   */
  async addSimpleActivity(data: {
    botId: string;
    activityType: string;
    targetType: string;
    priority: 'low' | 'medium' | 'high';
  }): Promise<void> {
    try {
      const task = {
        botId: data.botId,
        actionType: data.activityType,
        targetType: data.targetType,
        priority: data.priority,
        scheduledAt: new Date(),
        metadata: {
          isHealthCheck: true,
          reactivation: true
        }
      };

      // Додаємо в чергу з низьким пріоритетом
      await this.botQueueModel.create(task);
      
      this.logger.log(`📋 Додано просту активність для бота ${data.botId}`);
    } catch (error) {
      this.logger.error(`❌ Помилка додавання простої активності: ${error.message}`);
    }
  }

  /**
   * Отримати статистику по черзі з урахуванням кураторського впливу
   */
  async getQueueStatistics(caseId?: string): Promise<{
    pendingCount: number;
    completedToday: number;
    avgCompletionTime: number;
    curatorInfluence?: number;
  }> {
    try {
      const pendingCount = await this.botQueueModel.countDocuments({ status: 'pending' });
      
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const completedToday = await this.botQueueModel.countDocuments({
        status: 'completed',
        lastAttempt: { $gte: startOfDay }
      });

      // Розрахунок середнього часу виконання
      const completedTasks = await this.botQueueModel.find({
        status: 'completed',
        scheduledFor: { $ne: null },
        lastAttempt: { $ne: null }
      }).limit(100);

      let totalTime = 0;
      let count = 0;
      for (const task of completedTasks) {
        if (task.scheduledFor && task.lastAttempt) {
          const timeDiff = task.lastAttempt.getTime() - task.scheduledFor.getTime();
          if (timeDiff > 0) {
            totalTime += timeDiff;
            count++;
          }
        }
      }

      const avgCompletionTime = count > 0 ? totalTime / count : 0;

      const result: any = {
        pendingCount,
        completedToday,
        avgCompletionTime: Math.round(avgCompletionTime / 60000) // Конвертуємо в хвилини
      };

      // Додаємо інформацію про кураторський вплив, якщо надано caseId
      if (caseId) {
        try {
          const { multiplier } = await this.curatorAnalytics.getBoostMultiplier(caseId);
          result.curatorInfluence = Math.round((multiplier - 1) * 100); // Відсотковий вплив
        } catch (error) {
          this.logger.warn(`Не вдалося отримати кураторський вплив для кейсу ${caseId}: ${error.message}`);
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`Помилка отримання статистики черги: ${error.message}`);
      return {
        pendingCount: 0,
        completedToday: 0,
        avgCompletionTime: 0
      };
    }
  }
}