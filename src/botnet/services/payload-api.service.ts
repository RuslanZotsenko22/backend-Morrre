import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

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
export class PayloadApiService {
  private readonly payloadUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.payloadUrl = this.configService.get('PAYLOAD_URL') || 'http://localhost:3001';
    this.apiKey = this.configService.get('PAYLOAD_API_KEY') || '';
  }

  async getBotnetSettings(): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.payloadUrl}/api/botnet-settings`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }),
      );
      return response.data;
    } catch (error) {
      console.error('Failed to fetch botnet settings:', error);
      return null;
    }
  }

  async createBot(botData: any): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.payloadUrl}/api/bots`, botData, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }),
      );
      return response.data;
    } catch (error) {
      console.error('Failed to create bot:', error);
      throw error;
    }
  }

  async updateBot(botId: string, updateData: any): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.patch(`${this.payloadUrl}/api/bots/${botId}`, updateData, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }),
      );
      return response.data;
    } catch (error) {
      console.error('Failed to update bot:', error);
      throw error;
    }
  }

  async addToQueue(queueData: any): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.payloadUrl}/api/botnet-queue`, queueData, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }),
      );
      return response.data;
    } catch (error) {
      console.error('Failed to add task to queue:', error);
      throw error;
    }
  }

  async getBotsFromPayload(): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.payloadUrl}/api/bots?limit=1000`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }),
      );
      return response.data;
    } catch (error) {
      console.error('Failed to fetch bots from Payload:', error);
      return { docs: [] };
    }
  }

  async updateBotActivity(botId: string): Promise<any> {
    try {
      const updateData = {
        lastActivity: new Date().toISOString(),
      };

      const response = await firstValueFrom(
        this.httpService.patch(`${this.payloadUrl}/api/bots/${botId}`, updateData, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }),
      );
      return response.data;
    } catch (error) {
      console.error('Failed to update bot activity:', error);
      throw error;
    }
  }

  async getQueueTasks(): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.payloadUrl}/api/botnet-queue?limit=100`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }),
      );
      return response.data;
    } catch (error) {
      console.error('Failed to fetch queue tasks:', error);
      return { docs: [] };
    }
  }

  // ========== МЕТОДИ ДЛЯ АВАТАРОК ==========

  /**
   * Отримати всі аватарки ботів
   */
  async getBotAvatars(): Promise<BotAvatar[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.payloadUrl}/api/bot-avatars`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          params: {
            limit: 1000,
            depth: 2,
          },
        }),
      );

      const docs = response.data.docs || [];

      return docs.map((doc: any) => ({
        id: doc.id,
        filename: doc.filename,
        url: doc.url || doc.sizes?.thumbnail?.url || doc.sizes?.original?.url,
        assignedToBot: doc.assignedToBot,
        isAssigned: doc.isAssigned || false,
      }));
    } catch (error) {
      console.error('Error fetching bot avatars:', error);
      return [];
    }
  }

  /**
   * Призначити аватарку боту
   */
  async assignAvatarToBot(avatarId: string, botId: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.patch(
          `${this.payloadUrl}/api/bot-avatars/${avatarId}`,
          {
            assignedToBot: botId,
            isAssigned: true,
          },
          {
            headers: { Authorization: `Bearer ${this.apiKey}` },
          },
        ),
      );

      console.log(`Assigned avatar ${avatarId} to bot ${botId}`);
      return true;
    } catch (error) {
      console.error(`Error assigning avatar ${avatarId} to bot ${botId}:`, error);
      return false;
    }
  }

  /**
   * Скинути призначення аватарки
   */
  async resetAvatarAssignment(avatarId: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.patch(
          `${this.payloadUrl}/api/bot-avatars/${avatarId}`,
          {
            assignedToBot: null,
            isAssigned: false,
          },
          {
            headers: { Authorization: `Bearer ${this.apiKey}` },
          },
        ),
      );

      console.log(`Reset assignment for avatar ${avatarId}`);
      return true;
    } catch (error) {
      console.error(`Error resetting assignment for avatar ${avatarId}:`, error);
      return false;
    }
  }

  /**
   * Завантажити нову аватарку
   */
  async uploadBotAvatar(file: Express.Multer.File): Promise<BotAvatar | null> {
    try {
      // Для завантаження файлу через FormData потрібно використовувати axios напряму
      // Оскільки HttpService з Nest.js має обмеження з FormData
      const axios = require('axios');
      const FormData = require('form-data');
      
      const formData = new FormData();
      formData.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      const response = await axios.post(
        `${this.payloadUrl}/api/bot-avatars`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            ...formData.getHeaders(),
          },
        }
      );

      const doc = response.data.doc || response.data;

      return {
        id: doc.id,
        filename: doc.filename,
        url: doc.url || doc.sizes?.thumbnail?.url || doc.sizes?.original?.url,
        assignedToBot: doc.assignedToBot,
        isAssigned: doc.isAssigned || false,
      };
    } catch (error) {
      console.error('Error uploading bot avatar:', error);
      return null;
    }
  }

  /**
   * Видалити аватарку
   */
  async deleteBotAvatar(avatarId: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.delete(`${this.payloadUrl}/api/bot-avatars/${avatarId}`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }),
      );

      console.log(`Deleted avatar ${avatarId}`);
      return true;
    } catch (error) {
      console.error(`Error deleting avatar ${avatarId}:`, error);
      return false;
    }
  }
}