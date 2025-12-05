import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ReferralLink, ReferralLinkDocument } from './schemas/referral-link.schema';
import { JuryStats, JuryStatsDocument } from './schemas/jury-stats.schema';
import { CreateReferralLinkDto } from './dto/create-referral-link.dto';
import { UseReferralLinkDto } from './dto/use-referral-link.dto';
import { ReferralResponseDto } from './dto/referral-response.dto';

@Injectable()
export class ReferralService {
  constructor(
    @InjectModel(ReferralLink.name) private referralLinkModel: Model<ReferralLinkDocument>,
    @InjectModel(JuryStats.name) private juryStatsModel: Model<JuryStatsDocument>,
  ) {}

  /**
   * Генерація унікального коду для реферального посилання
   */
  private generateUniqueCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Створення нового реферального посилання для журі
   */
  async createReferralLink(createReferralLinkDto: CreateReferralLinkDto): Promise<ReferralResponseDto> {
  const { juryId } = createReferralLinkDto; // juryId тепер приходить з DTO
    // Перевіряємо чи журі може створити посилання
    let juryStats = await this.juryStatsModel.findOne({ juryId });
    
    if (!juryStats) {
      // Якщо запису немає - створюємо новий з 2 доступними посиланнями
      juryStats = await this.juryStatsModel.create({
        juryId,
        availableLinks: 2,
        usedLinks: 0,
      });
    }

    if (juryStats.availableLinks <= 0) {
      throw new ConflictException('Ліміт реферальних посилань вичерпано. Максимум 2 посилання на журі.');
    }

    // Генеруємо унікальний код
    let code: string = '';
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!isUnique && attempts < maxAttempts) {
      code = this.generateUniqueCode();
      const existingLink = await this.referralLinkModel.findOne({ code });
      if (!existingLink) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new ConflictException('Не вдалося згенерувати унікальний код. Спробуйте ще раз.');
    }

    // Створюємо реферальне посилання
    const referralLink = await this.referralLinkModel.create({
      code,
      juryId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 днів
    });

    // Оновлюємо статистику журі
    await this.juryStatsModel.updateOne(
      { juryId },
      { $inc: { availableLinks: -1 } }
    );

    return {
      success: true,
      message: 'Реферальне посилання успішно створено',
      code: referralLink.code,
    };
  }

  /**
   * Використання реферального посилання користувачем
   */
  async useReferralLink(useReferralLinkDto: UseReferralLinkDto): Promise<ReferralResponseDto> {
  const { code, userId } = useReferralLinkDto; // userId тепер приходить з DTO

    // Перевіряємо чи користувач вже використав якесь посилання
    const existingUsage = await this.referralLinkModel.findOne({
      usedBy: userId,
      isUsed: true,
    });

    if (existingUsage) {
      throw new ConflictException('Ви вже приєдналися за реферальним посиланням');
    }

    // Знаходимо посилання
    const referralLink = await this.referralLinkModel.findOne({ code });
    
    if (!referralLink) {
      throw new NotFoundException('Реферальне посилання не знайдено');
    }

    if (referralLink.isUsed) {
      throw new BadRequestException('Це посилання вже використано');
    }

    if (new Date() > referralLink.expiresAt) {
      throw new BadRequestException('Термін дії посилання закінчився');
    }

    // Оновлюємо посилання як використане
    referralLink.isUsed = true;
    referralLink.usedBy = userId as any;
    await referralLink.save();

    // Оновлюємо статистику журі
    await this.juryStatsModel.updateOne(
      { juryId: referralLink.juryId },
      { $inc: { usedLinks: 1 } }
    );

    return {
      success: true,
      message: 'Ви успішно приєдналися за реферальним посиланням',
      code: referralLink.code,
      usedBy: userId,
    };
  }

  /**
   * Отримання статистики журі
   */
  async getJuryStats(juryId: string) {
    let juryStats = await this.juryStatsModel.findOne({ juryId });
    
    if (!juryStats) {
      juryStats = await this.juryStatsModel.create({
        juryId,
        availableLinks: 2,
        usedLinks: 0,
      });
    }

    return juryStats;
  }

  /**
   * Перевірка чи користувач має право голосувати (використав реферал)
   */
  async canUserVote(userId: string): Promise<boolean> {
    const referralLink = await this.referralLinkModel.findOne({
      usedBy: userId,
      isUsed: true,
    });

    return !!referralLink;
  }

  /**
   * Отримання всіх реферальних посилань журі
   */
  async getJuryReferralLinks(juryId: string) {
    return this.referralLinkModel
      .find({ juryId })
      .populate('usedBy', 'username email')
      .sort({ createdAt: -1 })
      .exec();
  }
}