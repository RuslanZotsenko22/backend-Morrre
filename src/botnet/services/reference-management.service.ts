// src/botnet/services/reference-management.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Bot } from '../schemas/bot.schema';
import { Case } from '../../cases/schemas/case.schema';
import { LikesService } from '../../likes/likes.service';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class ReferenceManagementService {
  private readonly logger = new Logger(ReferenceManagementService.name);

  constructor(
    @InjectModel(Bot.name) private botModel: Model<Bot>,
    @InjectModel(Case.name) private caseModel: Model<Case>,
    private readonly likesService: LikesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Боти забирають випадкові референси з кейсів
   */
  async assignRandomReferences(): Promise<void> {
    try {
      this.logger.log('🔄 Початок розподілу референсів між ботами...');

      // Отримуємо ботів, які можуть голосувати (обмеження 80)
      const votingBots = await this.botModel.find({
        isActive: true,
        canVote: true
      }).limit(80).exec();

      if (votingBots.length === 0) {
        this.logger.warn('❌ Не знайдено ботів для розподілу референсів');
        return;
      }

      // Отримуємо кейси з референсами за останні 7 днів
      const casesWithReferences = await this.caseModel.find({
        'references.0': { $exists: true }, // Є хоча б один референс
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }).exec();

      if (casesWithReferences.length === 0) {
        this.logger.warn('❌ Не знайдено кейсів з референсами');
        return;
      }

      let assignedCount = 0;

      for (const bot of votingBots) {
        // Вибираємо випадковий кейс
        const randomCase = casesWithReferences[
          Math.floor(Math.random() * casesWithReferences.length)
        ];

        if (randomCase.references && randomCase.references.length > 0) {
          // Вибираємо випадковий референс
          const randomReference = randomCase.references[
            Math.floor(Math.random() * randomCase.references.length)
          ];

          // Оновлюємо бота - додаємо інформацію про взятий референс
          await this.botModel.findByIdAndUpdate(bot._id, {
            $push: {
              takenReferences: {
                referenceId: randomReference._id,
                caseId: randomCase._id,
                takenAt: new Date()
              }
            }
          });

          assignedCount++;
          this.logger.log(`✅ Бот ${bot._id} взяв референс ${randomReference._id}`);

          // Запускаємо лайки на цей референс
          await this.addBotLikesToReference(randomReference._id.toString(), randomCase._id.toString());
        }
      }

      this.logger.log(`🎯 Розподілено референсів: ${assignedCount} з ${votingBots.length} ботів`);
    } catch (error) {
      this.logger.error(`❌ Помилка розподілу референсів: ${error.message}`, error.stack);
    }
  }

  /**
   * Додаємо лайки на референс від інших ботів (5-15 лайків)
   */
  private async addBotLikesToReference(referenceId: string, caseId: string): Promise<void> {
    try {
      const likeCount = Math.floor(Math.random() * 11) + 5; // 5-15 лайків

      // Отримуємо випадкових ботів для лайків
      const likeBots = await this.botModel.aggregate([
        { $match: { isActive: true } },
        { $sample: { size: likeCount } }
      ]);

      this.logger.log(`❤️ Додаємо ${likeCount} лайків на референс ${referenceId}`);

      for (const bot of likeBots) {
        // Додаємо затримку для органічності (від 30 секунд до 5 хвилин)
        const delay = Math.random() * 270000 + 30000; // 30 сек - 5 хв
        await this.delay(delay);

        // Створюємо лайк через LikesService
       await this.likesService.createBotLike({
  userId: bot._id.toString(),
  targetId: referenceId,
  targetType: 'reference',
});

        // Оновлюємо лічильник лайків в кейсі
        await this.caseModel.updateOne(
          { 
            _id: caseId,
            'references._id': referenceId 
          },
          { 
            $inc: { 'references.$.likesCount': 1 } 
          }
        );

        // Створюємо сповіщення для власника кейсу
        const caseData = await this.caseModel.findById(caseId);
        if (caseData) {
          await this.notificationsService.create({
            recipient: caseData.ownerId.toString(),
            actor: bot._id.toString(),
            type: 'LIKE_REFERENCE',
            metadata: {
              caseId: caseId,
              referenceId: referenceId
            }
          });
        }
      }

      this.logger.log(`✅ Успішно додано ${likeCount} лайків на референс ${referenceId}`);
    } catch (error) {
      this.logger.error(`❌ Помилка додавання лайків: ${error.message}`, error.stack);
    }
  }

  /**
   * Отримати референси, взяті ботом
   */
  async getBotReferences(botId: string): Promise<any[]> {
    const bot = await this.botModel.findById(botId).populate('takenReferences.caseId').exec();
    return bot?.takenReferences || [];
  }

  /**
   * Утиліта для затримки
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}