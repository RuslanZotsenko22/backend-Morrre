import { Injectable, Logger } from '@nestjs/common';
import { BotnetService } from '../botnet.service';
import { VoteActivityHook } from './vote-activity.hook'; 

@Injectable()
export class CasePublishHook {
  private readonly logger = new Logger(CasePublishHook.name);

  constructor(
    private botnetService: BotnetService,
    private voteActivityHook: VoteActivityHook, 
  ) {}

  /**
   * Хук для обробки публікації кейсу
   */
  async onCasePublished(caseId: string): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`🔄 Case published hook triggered for case: ${caseId}`);
      
      
      setTimeout(async () => {
        try {
          // Вибираємо випадкову кількість ботів для голосування (34-56 з першої черги)
          const voteCount = Math.floor(Math.random() * (56 - 34 + 1)) + 34;
          await this.voteActivityHook.onVoteActivity(caseId, voteCount);
          
          this.logger.log(`🎯 Started vote activity for case ${caseId} with ${voteCount} bots`);
        } catch (error) {
          this.logger.error(`❌ Failed to execute vote activity for case ${caseId}: ${error.message}`);
        }
      }, Math.random() * (20 - 10 + 1) + 10 * 60 * 1000); // 10-20 хвилин
      
      
      await this.botnetService.handleNewCase(caseId);
      
      this.logger.log(`✅ Botnet activity scheduled for case ${caseId}`);
      
      return {
        success: true,
        message: `Botnet activity scheduled for case ${caseId}`
      };
      
    } catch (error) {
      this.logger.error(`❌ Failed to schedule botnet activity for case ${caseId}: ${error.message}`);
      
      return {
        success: false,
        message: `Failed to schedule botnet activity: ${error.message}`
      };
    }
  }

  /**
   * Хук для ручного запуску бусту
   */
  async onCaseBoost(caseId: string): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`🚀 Manual boost requested for case: ${caseId}`);
      
      // Миттєвий буст активності
      await this.botnetService.boostActivity(caseId, 'case');
      
      this.logger.log(`✅ Manual boost activated for case ${caseId}`);
      
      return {
        success: true,
        message: `Manual boost activated for case ${caseId}`
      };
      
    } catch (error) {
      this.logger.error(`❌ Failed to activate manual boost for case ${caseId}: ${error.message}`);
      
      return {
        success: false,
        message: `Failed to activate manual boost: ${error.message}`
      };
    }
  }
}