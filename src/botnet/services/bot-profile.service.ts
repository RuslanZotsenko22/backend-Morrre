// src/botnet/services/bot-profile.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Bot } from '../schemas/bot.schema';
import { User } from '../../users/schemas/user.schema';
import { CasesService } from '../../cases/cases.service';
import { VotesService } from '../../votes/votes.service';
import { FollowsService } from '../../follows/follows.service';
import { LikesService } from '../../likes/likes.service';

export interface BotProfile {
  id: string;
  username: string;
  email: string;
  avatar: string;
  isBot: boolean;
  botData: {
    canVote: boolean;
    hasAvatar: boolean;
    lastActivity: Date;
    activityCount: number;
    status: 'active' | 'inactive' | 'suspended';
    createdAt: Date;
  };
  statistics: {
    totalVotes: number;
    totalLikes: number;
    totalFollows: number;
    totalComments: number;
    referencesTaken: number;
    lastVoteDate: Date | null;
  };
  recentActivity: Array<{
    type: 'vote' | 'like' | 'follow' | 'comment' | 'reference';
    targetId: string;
    targetType: string;
    createdAt: Date;
    details: any;
  }>;
}

interface BotLean {
  _id: any;
  email: string;
  canVote?: boolean;
  avatar?: string;
  lastActivity?: Date;
  activityCount?: number;
  isActive?: boolean;
  createdAt?: Date;
}

interface UserLean {
  _id: any;
  email: string;
  username?: string;
  avatarUrl?: string;
  isActive?: boolean;
  createdAt?: Date;
  isBot?: boolean;
  botCanVote?: boolean;
  botLastActivity?: Date;
  botActivityCount?: number;
  botData?: string;
  botAvatarId?: string;
  botHasAvatar?: boolean;
  botCreatedAt?: Date;
  botStatus?: string;
  botVotesCount?: number;
  botLikesCount?: number;
  botCommentsCount?: number;
  botFollowsCount?: number;
  botReferencesTaken?: number;
  botLastVoteDate?: Date;
}

@Injectable()
export class BotProfileService {
  private readonly logger = new Logger(BotProfileService.name);

  constructor(
    @InjectModel(Bot.name) private botModel: Model<Bot>,
    @InjectModel(User.name) private userModel: Model<User>,
    private casesService: CasesService,
    private votesService: VotesService,
    private followsService: FollowsService,
    private likesService: LikesService,
  ) {}

  /**
   * Отримати повний профіль бота
   */
  async getBotProfile(botId: string): Promise<BotProfile> {
    try {
      // 1. Знайти бота в колекції ботів
      const bot = await this.botModel.findById(botId).lean<BotLean>().exec();
      if (!bot) {
        throw new NotFoundException(`Bot with ID ${botId} not found`);
      }

      // 2. Знайти відповідного користувача по email
      const user = await this.userModel.findOne({ 
        email: bot.email,
        isBot: true 
      }).lean<UserLean>().exec();

      if (!user) {
        throw new NotFoundException(`User for bot ${botId} not found`);
      }

      // 3. Зібрати статистику
      const statistics = await this.getBotStatistics(botId, user._id.toString());

      // 4. Зібрати останню активність
      const recentActivity = await this.getRecentActivity(botId, user._id.toString());

      // 5. Скласти повний профіль
      const profile: BotProfile = {
        id: bot._id.toString(),
        username: user.username || '',
        email: user.email,
        avatar: user.avatarUrl || bot.avatar || '',
        isBot: true,
        botData: {
          canVote: bot.canVote || false,
          hasAvatar: !!(bot.avatar || user.botHasAvatar),
          lastActivity: bot.lastActivity || user.botLastActivity || new Date(),
          activityCount: bot.activityCount || user.botActivityCount || 0,
          status: (bot.isActive ? 'active' : 'inactive') as 'active' | 'inactive' | 'suspended',
          createdAt: bot.createdAt || user.createdAt || new Date(),
        },
        statistics,
        recentActivity,
      };

      return profile;
    } catch (error) {
      this.logger.error(`Error getting bot profile ${botId}:`, error);
      throw error;
    }
  }

  /**
   * Отримати статистику бота
   */
  private async getBotStatistics(botId: string, userId: string) {
    try {
      // Тут ви можете додати логіку для отримання реальної статистики
      // Наразі повертаємо заглушку
      return {
        totalVotes: Math.floor(Math.random() * 100),
        totalLikes: Math.floor(Math.random() * 500),
        totalFollows: Math.floor(Math.random() * 50),
        totalComments: Math.floor(Math.random() * 200),
        referencesTaken: Math.floor(Math.random() * 20),
        lastVoteDate: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      };
    } catch (error) {
      this.logger.error(`Error getting bot statistics:`, error);
      return {
        totalVotes: 0,
        totalLikes: 0,
        totalFollows: 0,
        totalComments: 0,
        referencesTaken: 0,
        lastVoteDate: null,
      };
    }
  }

  /**
   * Отримати останню активність бота
   */
  private async getRecentActivity(botId: string, userId: string): Promise<Array<{
    type: 'vote' | 'like' | 'follow' | 'comment' | 'reference';
    targetId: string;
    targetType: string;
    createdAt: Date;
    details: any;
  }>> {
    // Тут ви можете додати логіку для отримання реальної активності
    // Наразі повертаємо заглушку
    const activities: Array<{
      type: 'vote' | 'like' | 'follow' | 'comment' | 'reference';
      targetId: string;
      targetType: string;
      createdAt: Date;
      details: any;
    }> = [];
    
    const activityTypes: Array<'vote' | 'like' | 'follow' | 'comment' | 'reference'> = ['vote', 'like', 'follow', 'comment', 'reference'];
    
    for (let i = 0; i < 5; i++) {
      const type = activityTypes[Math.floor(Math.random() * activityTypes.length)];
      activities.push({
        type,
        targetId: `target_${Math.random().toString(36).substr(2, 9)}`,
        targetType: type === 'vote' ? 'case' : 'user',
        createdAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
        details: { score: type === 'vote' ? 7.5 + Math.random() * 1 : null }
      });
    }

    return activities.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Пошук ботів за різними критеріями
   */
  async searchBots(filters: {
    username?: string;
    status?: 'active' | 'inactive';
    canVote?: boolean;
    hasAvatar?: boolean;
    minActivityCount?: number;
    page?: number;
    limit?: number;
  }): Promise<{
    bots: BotProfile[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    try {
      const {
        username,
        status,
        canVote,
        hasAvatar,
        minActivityCount,
        page = 1,
        limit = 20,
      } = filters;

      // Створюємо запит для ботів
      const query: any = {};

      if (status === 'active') {
        query.isActive = true;
      } else if (status === 'inactive') {
        query.isActive = false;
      }

      if (canVote !== undefined) {
        query.canVote = canVote;
      }

      if (hasAvatar !== undefined) {
        query.avatar = { $exists: hasAvatar, $ne: hasAvatar ? '' : null };
      }

      if (minActivityCount !== undefined) {
        query.activityCount = { $gte: minActivityCount };
      }

      // Знаходимо ботів з фільтрами
      const [bots, total] = await Promise.all([
        this.botModel
          .find(query)
          .skip((page - 1) * limit)
          .limit(limit)
          .sort({ createdAt: -1 })
          .lean<BotLean[]>()
          .exec(),
        this.botModel.countDocuments(query),
      ]);

      // Знаходимо відповідних користувачів
      const botEmails = bots.map(bot => bot.email);
      const users = await this.userModel
        .find({ email: { $in: botEmails } })
        .lean<UserLean[]>()
        .exec();

      // Створюємо мапу email -> user для швидкого пошуку
      const userMap = new Map(users.map(user => [user.email, user]));

      // Формуємо профілі ботів
      const botProfiles: (BotProfile | null)[] = [];

      for (const bot of bots) {
        const user = userMap.get(bot.email);
        
        if (!user) {
          botProfiles.push(null);
          continue;
        }

        const statistics = await this.getBotStatistics(bot._id.toString(), user._id.toString());

        botProfiles.push({
          id: bot._id.toString(),
          username: user.username || '',
          email: user.email,
          avatar: user.avatarUrl || bot.avatar || '',
          isBot: true,
          botData: {
            canVote: bot.canVote || false,
            hasAvatar: !!(bot.avatar || user.botHasAvatar),
            lastActivity: bot.lastActivity || user.botLastActivity || new Date(),
            activityCount: bot.activityCount || user.botActivityCount || 0,
            status: (bot.isActive ? 'active' : 'inactive') as 'active' | 'inactive' | 'suspended',
            createdAt: bot.createdAt || user.createdAt || new Date(),
          },
          statistics,
          recentActivity: [], // Пустий масив для пошуку
        });
      }

      // Фільтруємо null значення
      const validBotProfiles = botProfiles.filter((profile): profile is BotProfile => {
        return profile !== null;
      });

      // Додаткова фільтрація по username
      let filteredProfiles = validBotProfiles;
      if (username) {
        const searchTerm = username.toLowerCase();
        filteredProfiles = validBotProfiles.filter(profile => {
          return profile.username.toLowerCase().includes(searchTerm);
        });
      }

      return {
        bots: filteredProfiles,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error('Error searching bots:', error);
      throw error;
    }
  }

  /**
   * Отримати список всіх ботів (для адмінки)
   */
  async getAllBots(): Promise<BotProfile[]> {
    try {
      const bots = await this.botModel.find().lean<BotLean[]>().exec();
      const botEmails = bots.map(bot => bot.email);
      
      const users = await this.userModel
        .find({ email: { $in: botEmails } })
        .lean<UserLean[]>()
        .exec();

      const userMap = new Map(users.map(user => [user.email, user]));

      const profiles: (BotProfile | null)[] = [];

      for (const bot of bots) {
        const user = userMap.get(bot.email);
        if (!user) {
          profiles.push(null);
          continue;
        }

        profiles.push({
          id: bot._id.toString(),
          username: user.username || '',
          email: user.email,
          avatar: user.avatarUrl || bot.avatar || '',
          isBot: true,
          botData: {
            canVote: bot.canVote || false,
            hasAvatar: !!(bot.avatar || user.botHasAvatar),
            lastActivity: bot.lastActivity || user.botLastActivity || new Date(),
            activityCount: bot.activityCount || user.botActivityCount || 0,
            status: (bot.isActive ? 'active' : 'inactive') as 'active' | 'inactive' | 'suspended',
            createdAt: bot.createdAt || user.createdAt || new Date(),
          },
          statistics: await this.getBotStatistics(bot._id.toString(), user._id.toString()),
          recentActivity: await this.getRecentActivity(bot._id.toString(), user._id.toString()),
        });
      }

      return profiles.filter((profile): profile is BotProfile => profile !== null);
    } catch (error) {
      this.logger.error('Error getting all bots:', error);
      throw error;
    }
  }
}