import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BotQueueService } from '../services/bot-queue.service';
import { ReferenceManagementService } from '../services/reference-management.service';
import { BotHealthMonitorService } from '../services/bot-health-monitor.service';

@Injectable()
export class QueueWorker {
  private readonly logger = new Logger(QueueWorker.name);

  constructor(private botQueueService: BotQueueService,private readonly referenceManagementService: ReferenceManagementService,private readonly botHealthMonitorService: BotHealthMonitorService,) {}

  /**
   *  Обработка очереди каждые 30 секунд
   */
  @Cron(CronExpression.EVERY_30_MINUTES) // замінити коли система буде готова на 30 секунд 
  async processQueue(): Promise<void> {
    try {
      this.logger.debug('🔄 Processing bot queue...');
      await this.botQueueService.processPendingTasks();
    } catch (error) {
      this.logger.error(`❌ Queue processing failed: ${error.message}`);
    }
  }

  /**
   *  Ручной запуск обработки очереди
   */
  async processQueueManually(): Promise<{ processed: number }> {
    try {
      this.logger.log('👨‍💻 Manual queue processing started');
      await this.botQueueService.processPendingTasks();
      return { processed: 1 };
    } catch (error) {
      this.logger.error(`❌ Manual queue processing failed: ${error.message}`);
      throw error;
    }
  }
  /**
   * Запускати призначення референсів кожні 6 годин
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async handleReferenceAssignment() {
    this.logger.log('🔄 Запуск автоматичного призначення референсів...');
    try {
      await this.referenceManagementService.assignRandomReferences();
      this.logger.log('✅ Призначення референсів завершено');
    } catch (error) {
      this.logger.error(`❌ Помилка при призначенні референсів: ${error.message}`);
    }
  }

  /**
   * Перевірка здоров'я ботів кожні 6 годин
   */
  @Cron('0 */6 * * *') // Кожні 6 годин
  async handleBotHealthCheck() {
    this.logger.log('🏥 Запуск перевірки здоровʼя ботів...');
    try {
      const healthStats = await this.botHealthMonitorService.checkAllBotsHealth();
      this.logger.log(`🏥 Перевірка здоровʼя завершена: ${JSON.stringify(healthStats)}`);
    } catch (error) {
      this.logger.error(`❌ Помилка перевірки здоровʼя: ${error.message}`);
    }
  }

  /**
   * Щоденна детальна статистика
   */
  @Cron('0 9 * * *') // Щодня о 9:00
  async handleDailyHealthReport() {
    this.logger.log('📊 Генерація щоденного звіту здоровʼя...');
    try {
      const detailedStats = await this.botHealthMonitorService.getDetailedBotStats();
      this.logger.log(`📊 Щоденний звіт здоровʼя: ${JSON.stringify(detailedStats)}`);
      
      // Тут можна додати відправку звіту в адмінку або на email
    } catch (error) {
      this.logger.error(`❌ Помилка генерації звіту: ${error.message}`);
    }
  }


}