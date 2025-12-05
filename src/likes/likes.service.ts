import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Like, LikeDocument } from './schemas/like.schema';

@Injectable()
export class LikesService {
  private readonly logger = new Logger(LikesService.name);

  constructor(
    @InjectModel(Like.name) private likeModel: Model<LikeDocument>,
  ) {}

  /**
   * Створення лайка від імені бота
   */
  async createBotLike(data: {
    userId: string;
    targetId: string;
    targetType: 'case' | 'reference';
  }): Promise<LikeDocument> {
    try {
      const like = await this.likeModel.create({
        user: data.userId,
        targetId: data.targetId,
        targetType: data.targetType,
        isBot: true,
        createdAt: new Date(),
      });

      this.logger.log(`❤️ Bot like created by ${data.userId} for ${data.targetType} ${data.targetId}`);
      
      return like;
    } catch (error) {
      this.logger.error(`❌ Failed to create bot like: ${error.message}`);
      throw error;
    }
  }

  /**
   * Перевірка, чи вже ставив бот лайк цьому контенту
   */
  async hasBotLiked(botId: string, targetId: string): Promise<boolean> {
    const existingLike = await this.likeModel.findOne({
      user: botId,
      targetId: targetId,
      isBot: true,
    }).exec();

    return !!existingLike;
  }

  /**
   * Отримання кількості лайків для контенту
   */
  async getLikesCount(targetId: string): Promise<number> {
    return this.likeModel.countDocuments({ targetId });
  }

  /**
   * Отримання лайків ботів для контенту
   */
  async getBotLikesForTarget(targetId: string, limit: number = 50): Promise<LikeDocument[]> {
    return this.likeModel
      .find({ targetId, isBot: true })
      .populate('user', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * Масове створення лайків (для бусту активності)
   */
  async createMultipleBotLikes(botIds: string[], targetId: string, targetType: 'case' | 'reference'): Promise<number> {
    try {
      const likesToCreate = botIds.map(botId => ({
        user: botId,
        targetId,
        targetType,
        isBot: true,
        createdAt: new Date(),
      }));

      const result = await this.likeModel.insertMany(likesToCreate);
      this.logger.log(`❤️ Created ${result.length} bot likes for ${targetType} ${targetId}`);
      
      return result.length;
    } catch (error) {
      this.logger.error(`❌ Failed to create multiple bot likes: ${error.message}`);
      throw error;
    }
  }
}