import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Bot } from '../schemas/bot.schema';
import { PayloadApiService } from './payload-api.service';

@Injectable()
export class BotManagementService {
  constructor(
    @InjectModel(Bot.name) private botModel: Model<Bot>,
    private payloadApiService: PayloadApiService,
  ) {}

  async generateBots(count: number): Promise<void> {
    const adjectives = ['Creative', 'Digital', 'Art', 'Design', 'Pixel', 'Code', 'Visual', 'Graphic', 'UI', 'UX', 'Brand', 'Motion', 'Interactive', 'Modern', 'Clean'];
    const nouns = ['Master', 'Wizard', 'Artist', 'Designer', 'Creator', 'Expert', 'Genius', 'Pro', 'Guru', 'Specialist', 'Innovator', 'Visionary', 'Pioneer', 'Architect', 'Engineer'];

    const existingUsernames = await this.getAllExistingUsernames();
    
    for (let i = 0; i < count; i++) {
      const username = await this.generateUniqueUsername(adjectives, nouns, existingUsernames);
      const canVote = i < 80; // Тільки перші 80 ботів можуть голосувати

      // Додаємо нове ім'я до списку існуючих
      existingUsernames.add(username);

      try {
        // Створюємо бота в Payload CMS
        const payloadBot = await this.payloadApiService.createBot({
          username,
          canVote,
          status: 'active',
        });

        // Створюємо запис в основній базі даних
        await this.botModel.create({
          username,
          canVote,
          status: 'active',
          isBot: true,
          lastActivity: new Date(),
        });
      } catch (error) {
        // Якщо помилка дубліката, генеруємо нове ім'я
        if (error.code === 11000 || error.message?.includes('duplicate key')) {
          i--; // Повторюємо цю ітерацію
          continue;
        }
        throw error;
      }
    }
  }

  private async generateUniqueUsername(
    adjectives: string[], 
    nouns: string[], 
    existingUsernames: Set<string>,
    maxAttempts: number = 10
  ): Promise<string> {
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const username = this.generateUsername(adjectives, nouns);
      
      // Перевіряємо, чи існує таке ім'я в нашому сеті
      if (!existingUsernames.has(username)) {
        // Додатково перевіряємо в базі даних для безпеки
        const existsInDb = await this.botModel.exists({ username });
        if (!existsInDb) {
          return username;
        }
      }
      
      attempts++;
    }
    
    // Якщо не вдалося знайти унікальне ім'я, додаємо timestamp
    const timestamp = Date.now().toString().slice(-4);
    const baseUsername = this.generateUsername(adjectives, nouns);
    return `${baseUsername}${timestamp}`;
  }

  private generateUsername(adjectives: string[], nouns: string[]): string {
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 10000); // Збільшили до 10000 для більшої варіативності
    return `${adjective}${noun}${number}`;
  }

  private async getAllExistingUsernames(): Promise<Set<string>> {
    const bots = await this.botModel.find({}, 'username').exec();
    return new Set(bots.map(bot => bot.username));
  }

  async getActiveBots(limit?: number): Promise<Bot[]> {
    return this.botModel
      .find({ status: 'active' })
      .limit(limit || 1000)
      .exec();
  }

  async getVotingBots(limit?: number): Promise<Bot[]> {
    return this.botModel
      .find({ status: 'active', canVote: true })
      .limit(limit || 100)
      .exec();
  }

  async updateBotActivity(botId: string): Promise<void> {
    await this.botModel.findByIdAndUpdate(botId, {
      lastActivity: new Date(),
      $inc: { activityCount: 1 },
    });
  }

  // Метод для запису активності бота (alias для updateBotActivity)
  async recordBotActivity(botId: string): Promise<void> {
    await this.updateBotActivity(botId);
  }

  // Отримання всіх ботів для статистики
  async getAllBots(): Promise<{ total: number; active: number; voting: number }> {
    const total = await this.botModel.countDocuments();
    const active = await this.botModel.countDocuments({ status: 'active' });
    const voting = await this.botModel.countDocuments({ status: 'active', canVote: true });
    
    return { total, active, voting };
  }

  

  /**
   * Отримати ботів з аватарками
   */
  async getBotsWithAvatars(limit: number): Promise<Bot[]> {
    return this.botModel
      .find({ 
        avatar: { $exists: true, $ne: null } // Боти з аватарками
      })
      .limit(limit)
      .exec();
  }

  /**
   * Оновити час останнього голосування бота
   */
  async updateBotLastVote(botId: string): Promise<void> {
    await this.botModel.findByIdAndUpdate(botId, {
      lastActivity: new Date(),
      $inc: { activityCount: 1 },
    });
  }
}