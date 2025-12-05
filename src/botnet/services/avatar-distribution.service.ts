// src/botnet/services/avatar-distribution.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Bot } from '../schemas/bot.schema';
import { PayloadApiService } from './payload-api.service';

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

@Injectable()
export class AvatarDistributionService {
  private readonly logger = new Logger(AvatarDistributionService.name);

  constructor(
    @InjectModel(Bot.name) private botModel: Model<Bot>,
    private payloadApi: PayloadApiService,
  ) {}

  /**
   * Розподіляє аватарки на 80 ботів, які можуть голосувати
   */
  async distributeAvatars(): Promise<{ distributed: number; totalAvatars: number; botsWithAvatars: number }> {
    try {
      this.logger.log('Starting avatar distribution...');

      // 1. Отримати всі активні боти, які можуть голосувати
      const bots = await this.botModel
        .find({ 
          isActive: true,
          canVote: true,
          $or: [
            { hasAvatar: false },
            { hasAvatar: { $exists: false } },
            { avatarId: null },
          ]
        })
        .limit(80)
        .lean()
        .exec();

      this.logger.log(`Found ${bots.length} bots that can vote and need avatars`);

      // 2. Отримати всі доступні аватарки з Payload
      const avatars = await this.payloadApi.getBotAvatars();
      
      // Фільтруємо тільки не призначені аватарки
      const availableAvatars = avatars.filter(avatar => !avatar.isAssigned);
      
      this.logger.log(`Available avatars: ${availableAvatars.length}`);

      if (availableAvatars.length === 0) {
        this.logger.warn('No available avatars found');
        return { distributed: 0, totalAvatars: 0, botsWithAvatars: 0 };
      }

      // 3. Перемішати аватарки для рандомного розподілу
      const shuffledAvatars = this.shuffleArray([...availableAvatars]);

      // 4. Розподілити аватарки по ботах
      let distributed = 0;
      const batchPromises: Promise<void>[] = [];

      for (let i = 0; i < Math.min(bots.length, shuffledAvatars.length); i++) {
        const bot = bots[i];
        const avatar = shuffledAvatars[i];

        batchPromises.push(
          this.assignAvatarToBot(avatar.id, bot._id.toString())
        );

        distributed++;
        
        if (distributed % 10 === 0) {
          this.logger.log(`Distributed ${distributed} avatars...`);
        }
      }

      // Виконати всі операції паралельно
      await Promise.all(batchPromises);

      // 5. Порахувати загальну кількість ботів з аватарками
      const botsWithAvatars = await this.botModel.countDocuments({ 
        hasAvatar: true,
        avatarId: { $ne: null }
      });

      this.logger.log(`Successfully distributed ${distributed} avatars`);
      this.logger.log(`Total bots with avatars: ${botsWithAvatars}`);

      return { 
        distributed, 
        totalAvatars: availableAvatars.length,
        botsWithAvatars 
      };

    } catch (error) {
      this.logger.error('Error distributing avatars:', error);
      throw error;
    }
  }

  /**
   * Призначити аватарку боту
   */
  private async assignAvatarToBot(avatarId: string, botId: string): Promise<void> {
    try {
      // Оновлення в Payload
      await this.payloadApi.assignAvatarToBot(avatarId, botId);
      
      // Оновлення в MongoDB
      await this.botModel.updateOne(
        { _id: botId },
        { 
          $set: { 
            avatarId: avatarId,
            hasAvatar: true,
            updatedAt: new Date()
          }
        }
      );
    } catch (error) {
      this.logger.error(`Failed to assign avatar ${avatarId} to bot ${botId}:`, error);
      throw error;
    }
  }

  /**
   * Перевірити статус аватарок
   */
  async checkAvatarStatus(): Promise<{
    totalBots: number;
    botsCanVote: number;
    botsWithAvatars: number;
    availableAvatars: number;
    assignedAvatars: number;
  }> {
    const totalBots = await this.botModel.countDocuments({ isActive: true });
    const botsCanVote = await this.botModel.countDocuments({ 
      isActive: true, 
      canVote: true 
    });
    const botsWithAvatars = await this.botModel.countDocuments({ 
      isActive: true,
      hasAvatar: true,
      avatarId: { $ne: null }
    });

    const avatars = await this.payloadApi.getBotAvatars();
    const availableAvatars = avatars.filter(avatar => !avatar.isAssigned).length;
    const assignedAvatars = avatars.filter(avatar => avatar.isAssigned).length;

    return {
      totalBots,
      botsCanVote,
      botsWithAvatars,
      availableAvatars,
      assignedAvatars
    };
  }

  /**
   * Скинути призначення аватарок (для тестування)
   */
  async resetAvatarAssignments(): Promise<{ reset: number }> {
    try {
      // Отримати всі призначені аватарки
      const avatars = await this.payloadApi.getBotAvatars();
      const assignedAvatars = avatars.filter(avatar => avatar.isAssigned);

      // Скинути призначення в Payload
      const resetPromises = assignedAvatars.map(avatar => 
        this.payloadApi.resetAvatarAssignment(avatar.id)
      );
      await Promise.all(resetPromises);

      // Скинути призначення в ботів
      const result = await this.botModel.updateMany(
        { hasAvatar: true },
        { 
          $set: { 
            avatarId: null,
            hasAvatar: false,
            updatedAt: new Date()
          }
        }
      );

      this.logger.log(`Reset ${assignedAvatars.length} avatar assignments`);
      return { reset: result.modifiedCount };
    } catch (error) {
      this.logger.error('Error resetting avatar assignments:', error);
      throw error;
    }
  }

  /**
   * Утиліта для перемішування масиву
   */
  private shuffleArray<T>(array: T[]): T[] {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }
}