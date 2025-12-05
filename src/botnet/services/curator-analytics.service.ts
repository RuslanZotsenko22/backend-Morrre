// src/botnet/services/curator-analytics.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { Case } from '../../cases/schemas/case.schema';
import { Bot } from '../schemas/bot.schema';
import { ConfigService } from '@nestjs/config';

interface CuratorRatingResponse {
  id: string;
  rating: string;
  confidence: number;
  aspects?: {
    design?: string;
    creativity?: string;
    execution?: string;
  };
  curator: {
    id: string;
    weight: number;
    specializations: string[];
  };
  createdAt: string;
}

interface CuratorResponse {
  id: string;
  user: string;
  weight: number;
  specializations: string[];
  isActive: boolean;
  stats: {
    totalRatings: number;
    accuracyScore: number;
    lastActive: string;
  };
}

@Injectable()
export class CuratorAnalyticsService {
  private readonly logger = new Logger(CuratorAnalyticsService.name);
  private readonly payloadUrl: string;
  private readonly apiKey: string;

  constructor(
    @InjectModel(Case.name) private caseModel: Model<Case>,
    @InjectModel(Bot.name) private botModel: Model<Bot>,
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.payloadUrl = this.configService.get('PAYLOAD_URL') || 'http://localhost:3000';
    this.apiKey = this.configService.get('PAYLOAD_API_KEY') || '';
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
      const { multiplier, score, curatorCount } = await this.getBoostMultiplier(caseId);
      const qualityAnalysis = await this.analyzeContentQuality(caseId);
      
      return {
        multiplier,
        score,
        curatorCount,
        quality: qualityAnalysis,
        recommendations: qualityAnalysis.recommendations,
      };
    } catch (error) {
      this.logger.error(`Error analyzing with curators for case ${caseId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Отримати кураторські оцінки для кейсу з Payload
   */
  private async fetchCuratorRatings(caseId: string): Promise<CuratorRatingResponse[]> {
    try {
      const response = await lastValueFrom(
        this.httpService.get(
          `${this.payloadUrl}/api/curator-ratings`,
          {
            headers: { Authorization: `Bearer ${this.apiKey}` },
            params: {
              'where[case][equals]': caseId,
              limit: 100,
              depth: 1,
            },
          }
        )
      );
      return response.data.docs || [];
    } catch (error) {
      this.logger.error(`Помилка отримання кураторських оцінок: ${error.message}`);
      return [];
    }
  }

  /**
   * Отримати дані куратора
   */
  private async fetchCurator(curatorId: string): Promise<CuratorResponse | null> {
    try {
      const response = await lastValueFrom(
        this.httpService.get(
          `${this.payloadUrl}/api/curators/${curatorId}`,
          { headers: { Authorization: `Bearer ${this.apiKey}` } }
        )
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Помилка отримання куратора ${curatorId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Розрахувати середню зважену оцінку
   */
  async calculateWeightedAverage(caseId: string): Promise<{ score: number; curatorCount: number }> {
    const ratings = await this.fetchCuratorRatings(caseId);
    
    if (ratings.length === 0) {
      return { score: 1.0, curatorCount: 0 };
    }

    let totalWeight = 0;
    let weightedSum = 0;
    let activeCurators = 0;

    for (const rating of ratings) {
      // Отримуємо ID куратора з об'єкта curator
      const curatorId = rating.curator?.id;
      if (!curatorId) {
        continue;
      }

      const curator = await this.fetchCurator(curatorId);
      
      if (!curator || !curator.isActive) {
        continue;
      }

      const weight = curator.weight || 1.0;
      const confidence = rating.confidence || 1.0;
      const score = this.ratingToScore(rating.rating);
      
      // Загальна вага = вага куратора * впевненість в оцінці
      const totalWeightForRating = weight * confidence;
      
      weightedSum += score * totalWeightForRating;
      totalWeight += totalWeightForRating;
      activeCurators++;
    }

    if (totalWeight === 0) {
      return { score: 1.0, curatorCount: activeCurators };
    }

    return {
      score: weightedSum / totalWeight,
      curatorCount: activeCurators,
    };
  }

  /**
   * Конвертувати текстову оцінку в числовий бал
   */
  private ratingToScore(rating: string): number {
    const scoreMap = {
      'excellent': 1.5,
      'good': 1.2,
      'neutral': 1.0,
      'bad': 0.7,
      'very_bad': 0.5,
    };
    return scoreMap[rating] || 1.0;
  }

  /**
   * Конвертувати числовий бал в текстову оцінку
   */
  private scoreToRating(score: number): string {
    if (score >= 1.3) return 'excellent';
    if (score >= 1.1) return 'good';
    if (score >= 0.9) return 'neutral';
    if (score >= 0.7) return 'bad';
    return 'very_bad';
  }

  /**
   * Отримати множник бусту на основі кураторських оцінок
   */
  async getBoostMultiplier(caseId: string): Promise<{ multiplier: number; score: number; curatorCount: number }> {
    const { score, curatorCount } = await this.calculateWeightedAverage(caseId);
    
    let multiplier = 1.0;
    
    if (score >= 1.3) {
      multiplier = 1.5; // +50%
    } else if (score >= 1.1) {
      multiplier = 1.25; // +25%
    } else if (score >= 0.9) {
      multiplier = 1.0; // без змін
    } else if (score >= 0.7) {
      multiplier = 0.75; // -25%
    } else {
      multiplier = 0.5; // -50%
    }

    return { multiplier, score, curatorCount };
  }

  /**
   * Оновити інформацію про кураторський аналіз в кейсі
   */
  async updateCaseCuratorData(
    caseId: string, 
    multiplier: number, 
    score: number, 
    curatorCount: number,
    curatorIds: string[] = []
  ): Promise<void> {
    await this.caseModel.findByIdAndUpdate(caseId, {
      $set: {
        'curatorData.score': score,
        'curatorData.adjustedBoost': multiplier,
        'curatorData.lastCheck': new Date(),
        'curatorData.curatorCount': curatorCount,
        'curatorData.curatorIds': curatorIds,
        'curatorData.averageRating': this.scoreToRating(score),
      }
    });
  }

  /**
   * Знайти активних кураторів для спеціалізації
   */
  async findActiveCuratorsForSpecialization(specialization: string): Promise<CuratorResponse[]> {
    try {
      const response = await lastValueFrom(
        this.httpService.get(
          `${this.payloadUrl}/api/curators`,
          {
            headers: { Authorization: `Bearer ${this.apiKey}` },
            params: {
              'where[isActive][equals]': true,
              'where[specializations][contains]': specialization,
              limit: 5,
              depth: 1,
            },
          }
        )
      );
      return response.data.docs || [];
    } catch (error) {
      this.logger.error(`Помилка пошуку кураторів: ${error.message}`);
      return [];
    }
  }

  /**
   * Запросити оцінки у кураторів
   */
  async requestCuratorReviews(caseId: string): Promise<void> {
    try {
      const caseData = await this.caseModel.findById(caseId);
      if (!caseData) {
        throw new Error(`Кейс ${caseId} не знайдено`);
      }

      // Визначаємо спеціалізацію кейсу
      const specializations = this.determineCaseSpecializations(caseData);
      
      // Знаходимо кураторів для кожної спеціалізації
      const allCurators: CuratorResponse[] = [];
      
      for (const spec of specializations) {
        const curators = await this.findActiveCuratorsForSpecialization(spec);
        allCurators.push(...curators);
      }

      // Вибираємо унікальних кураторів
      const uniqueCurators = Array.from(
        new Map(allCurators.map(curator => [curator.id, curator])).values()
      ).slice(0, 3); // Не більше 3 кураторів

      // Створюємо завдання для кожного куратора
      for (const curator of uniqueCurators) {
        await this.createCuratorReviewRequest(curator.id, caseId);
      }

      this.logger.log(`Надіслано запити на оцінку ${uniqueCurators.length} кураторам для кейсу ${caseId}`);
    } catch (error) {
      this.logger.error(`Помилка запиту оцінок: ${error.message}`);
    }
  }

  /**
   * Визначити спеціалізації кейсу
   */
  private determineCaseSpecializations(caseData: any): string[] {
    const tags = caseData.tags || [];
    const whatWasDone = caseData.whatWasDone || [];
    const categories = caseData.categories || [];

    const specializations = new Set<string>();

    // Аналізуємо теги
    if (tags.some(tag => ['дизайн', 'design', 'ui', 'ux'].includes(tag.toLowerCase()))) {
      specializations.add('design');
      specializations.add('uxui');
    }
    
    if (tags.some(tag => ['код', 'code', 'програмування', 'development'].includes(tag.toLowerCase()))) {
      specializations.add('code');
    }
    
    if (tags.some(tag => ['анімація', 'animation', 'motion'].includes(tag.toLowerCase()))) {
      specializations.add('animation');
    }
    
    if (tags.some(tag => ['3d', '3д', 'моделювання'].includes(tag.toLowerCase()))) {
      specializations.add('3d');
    }
    
    if (tags.some(tag => ['брендинг', 'branding'].includes(tag.toLowerCase()))) {
      specializations.add('branding');
    }

    // Аналізуємо whatWasDone
    if (whatWasDone.includes('ui-ux')) {
      specializations.add('uxui');
    }
    if (whatWasDone.includes('3d')) {
      specializations.add('3d');
    }
    if (whatWasDone.includes('motion')) {
      specializations.add('animation');
    }

    return Array.from(specializations);
  }

  /**
   * Створити запит на оцінку для куратора
   */
  private async createCuratorReviewRequest(curatorId: string, caseId: string): Promise<void> {
    try {
      // Тут можна реалізувати відправку сповіщення через твою систему нотифікацій
      // Наразі просто логуємо
      this.logger.log(`Запит на оцінку для куратора ${curatorId} по кейсу ${caseId}`);
      
      // Або створити запис в черзі для ручної оцінки
      await this.createManualReviewTask(curatorId, caseId);
    } catch (error) {
      this.logger.error(`Помилка створення запиту: ${error.message}`);
    }
  }

  /**
   * Створити завдання для ручної оцінки куратором
   */
  private async createManualReviewTask(curatorId: string, caseId: string): Promise<void> {
    // Це можна реалізувати через чергу завдань
    // Наприклад, створити запис в BotQueue для адміністратора
  }

  /**
   * Застосувати кураторський буст до активності
   */
  async applyCuratorBoostToActivity(
    caseId: string, 
    baseBoostConfig: { minBots: number; maxBots: number }[]
  ): Promise<{ minBots: number; maxBots: number }[]> {
    const { multiplier } = await this.getBoostMultiplier(caseId);
    
    return baseBoostConfig.map(queue => ({
      minBots: Math.max(34, Math.min(349, Math.round(queue.minBots * multiplier))),
      maxBots: Math.max(34, Math.min(349, Math.round(queue.maxBots * multiplier))),
    }));
  }

  /**
   * Аналіз якості контенту на основі кураторських оцінок
   */
  async analyzeContentQuality(caseId: string): Promise<{
    quality: 'high' | 'medium' | 'low';
    aspects: {
      design: number;
      creativity: number;
      execution: number;
    };
    recommendations: string[];
  }> {
    const ratings = await this.fetchCuratorRatings(caseId);
    
    if (ratings.length === 0) {
      return {
        quality: 'medium',
        aspects: { design: 1.0, creativity: 1.0, execution: 1.0 },
        recommendations: ['Потрібні оцінки кураторів для аналізу якості']
      };
    }

    let designScore = 0;
    let creativityScore = 0;
    let executionScore = 0;
    let totalWeight = 0;

    for (const rating of ratings) {
      // Отримуємо ID куратора з об'єкта curator
      const curatorId = rating.curator?.id;
      if (!curatorId) {
        continue;
      }

      const curator = await this.fetchCurator(curatorId);
      if (!curator || !curator.isActive) continue;

      const weight = curator.weight || 1.0;
      
      if (rating.aspects?.design) {
        designScore += this.ratingToScore(rating.aspects.design) * weight;
      }
      if (rating.aspects?.creativity) {
        creativityScore += this.ratingToScore(rating.aspects.creativity) * weight;
      }
      if (rating.aspects?.execution) {
        executionScore += this.ratingToScore(rating.aspects.execution) * weight;
      }
      
      totalWeight += weight;
    }

    if (totalWeight === 0) {
      return {
        quality: 'medium',
        aspects: { design: 1.0, creativity: 1.0, execution: 1.0 },
        recommendations: []
      };
    }

    const avgDesign = designScore / totalWeight;
    const avgCreativity = creativityScore / totalWeight;
    const avgExecution = executionScore / totalWeight;
    const overall = (avgDesign + avgCreativity + avgExecution) / 3;

    const quality = overall >= 1.2 ? 'high' : overall >= 0.8 ? 'medium' : 'low';

    const recommendations: string[] = [];
    if (avgDesign < 1.0) recommendations.push('Покращити дизайн');
    if (avgCreativity < 1.0) recommendations.push('Додати креативних елементів');
    if (avgExecution < 1.0) recommendations.push('Покращити якість виконання');

    return {
      quality,
      aspects: {
        design: avgDesign,
        creativity: avgCreativity,
        execution: avgExecution,
      },
      recommendations,
    };
  }
}