import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Comment, CommentDocument } from './schemas/comment.schema';

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
  ) {}

  /**
   * Создание комментария от имени бота
   */
  async createBotComment(data: {
    userId: string;
    targetId: string;
    targetType: 'case' | 'reference';
    text: string;
  }): Promise<CommentDocument> {
    try {
      const comment = await this.commentModel.create({
        user: data.userId,
        targetId: data.targetId,
        targetType: data.targetType,
        text: data.text,
        isBot: true,
        createdAt: new Date(),
      });

      this.logger.log(`✅ Bot comment created by ${data.userId} for ${data.targetType} ${data.targetId}`);
      
      return comment;
    } catch (error) {
      this.logger.error(`❌ Failed to create bot comment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Проверка, комментировал ли уже бот этот контент
   */
  async hasBotCommented(botId: string, targetId: string): Promise<boolean> {
    const existingComment = await this.commentModel.findOne({
      user: botId,
      targetId: targetId,
      isBot: true,
    }).exec();

    return !!existingComment;
  }

  /**
   * Получение комментариев для контента
   */
  async getCommentsForTarget(targetId: string, limit: number = 50): Promise<CommentDocument[]> {
    return this.commentModel
      .find({ targetId })
      .populate('user', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }
}