import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class VimeoService {
  private readonly logger = new Logger(VimeoService.name);
  private api = axios.create({
    baseURL: 'https://api.vimeo.com',
    headers: { Authorization: `Bearer ${process.env.VIMEO_ACCESS_TOKEN}` },
  });

  async ensureFolder(caseId: string): Promise<string> {
    // TODO: перевірити існування папки, якщо немає — створити
    // Повертаємо ідентифікатор (можеш кешувати в БД)
    return caseId;
  }

  async uploadToVimeo(filePath: string, folderId: string): Promise<{ vimeoId: string }> {
    // TODO: Реалізуй TUS upload або стрім через офіційний SDK
    // На MVP можна імітувати завантаження і відразу віддавати "vimeoId"
    const vimeoId = 'simulated-' + Date.now();
    this.logger.log(`Simulated upload ${filePath} -> folder ${folderId} => ${vimeoId}`);
    return { vimeoId };
  }
}
