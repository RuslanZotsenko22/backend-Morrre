// src/follows/follows.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Follow, FollowDocument } from './schemas/follow.schema';

@Injectable()
export class FollowsService {
  private readonly logger = new Logger(FollowsService.name);

  constructor(
    @InjectModel(Follow.name) private followModel: Model<FollowDocument>,
  ) {}

  /**
   * Створення підписки від імені бота
   */
  async createBotFollow(data: {
    followerId: string; // ID бота
    followingId: string; // ID користувача, на якого підписуємось
  }): Promise<FollowDocument | null> { // 🆕 ДОДАЄМО | null
    try {
      const follow = await this.followModel.create({
        follower: new Types.ObjectId(data.followerId),
        following: new Types.ObjectId(data.followingId),
        isBot: true,
        createdAt: new Date(),
      });

      this.logger.log(`👤 Bot follow created: ${data.followerId} → ${data.followingId}`);
      
      return follow;
    } catch (error) {
      // Якщо це помилка дублікату (вже підписаний), просто логуємо
      if (error.code === 11000) {
        this.logger.warn(`Bot ${data.followerId} already follows user ${data.followingId}`);
        return null; // 🆕 ТЕПЕР МОЖЕМО ПОВЕРТАТИ NULL
      }
      
      this.logger.error(`❌ Failed to create bot follow: ${error.message}`);
      throw error;
    }
  }

  /**
   * Перевірка, чи вже підписаний бот на користувача
   */
  async hasBotFollowed(botId: string, userId: string): Promise<boolean> {
    const existingFollow = await this.followModel.findOne({
      follower: new Types.ObjectId(botId),
      following: new Types.ObjectId(userId),
      isBot: true,
    }).exec();

    return !!existingFollow;
  }

  /**
   * Отримання кількості підписок ботів на користувача
   */
  async getBotFollowersCount(userId: string): Promise<number> {
    return this.followModel.countDocuments({ 
      following: new Types.ObjectId(userId), 
      isBot: true 
    });
  }

  /**
   * Масове створення підписок (для бусту активності)
   */
  async createMultipleBotFollows(botIds: string[], userId: string): Promise<number> {
    try {
      const followsToCreate = botIds.map(botId => ({
        follower: new Types.ObjectId(botId),
        following: new Types.ObjectId(userId),
        isBot: true,
        createdAt: new Date(),
      }));

      const result = await this.followModel.insertMany(followsToCreate, { 
        ordered: false // Продовжувати при помилках дублікатів
      });
      
      this.logger.log(`👤 Created ${result.length} bot follows for user ${userId}`);
      
      return result.length;
    } catch (error: any) { // 🆕 ДОДАЄМО ТИП any
      // Якщо це bulk write error, все одно повертаємо кількість успішних
      if (error.result && error.result.insertedCount > 0) {
        this.logger.log(`👤 Created ${error.result.insertedCount} bot follows for user ${userId} (some duplicates skipped)`);
        return error.result.insertedCount;
      }
      
      this.logger.error(`❌ Failed to create multiple bot follows: ${error.message}`);
      throw error;
    }
  }

  /**
   * Розподіл підписок між власником та учасниками (70%/30%)
   */
  async distributeFollows(botIds: string[], caseData: any): Promise<void> {
    try {
      const ownerId = caseData.ownerId;
      const participantIds = caseData.participantIds || [];
      
      // Розрахунок кількості підписок для кожного
      const totalBots = botIds.length;
      const ownerBotsCount = Math.floor(totalBots * 0.7); // 70% власнику
      const remainingBots = totalBots - ownerBotsCount;
      
      // Розподіл решти між учасниками
      const botsPerParticipant = participantIds.length > 0 
        ? Math.floor(remainingBots / participantIds.length) 
        : 0;

      // Підписки для власника
      const ownerBots = botIds.slice(0, ownerBotsCount);
      if (ownerBots.length > 0) {
        await this.createMultipleBotFollows(ownerBots, ownerId);
      }

      // Підписки для учасників
      if (participantIds.length > 0 && botsPerParticipant > 0) {
        let botIndex = ownerBotsCount;
        
        for (const participantId of participantIds) {
          if (botIndex >= totalBots) break;
          
          const participantBots = botIds.slice(botIndex, botIndex + botsPerParticipant);
          if (participantBots.length > 0) {
            await this.createMultipleBotFollows(participantBots, participantId);
          }
          
          botIndex += botsPerParticipant;
        }
      }

      this.logger.log(`📊 Distributed ${totalBots} follows: ${ownerBotsCount} to owner, ${remainingBots} to participants`);
    } catch (error) {
      this.logger.error(`❌ Failed to distribute follows: ${error.message}`);
      throw error;
    }
  }
}