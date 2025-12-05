import { Injectable, Logger } from '@nestjs/common';
import { BotnetService } from '../botnet.service';
import { VotesService } from '../../votes/votes.service';

@Injectable()
export class VoteActivityHook {
  private readonly logger = new Logger(VoteActivityHook.name);

  constructor(
    private botnetService: BotnetService,
    private votesService: VotesService,
  ) {}

  /**
   * Хук для запуску голосування ботів за кейс
   */
  async onVoteActivity(caseId: string, voteCount: number): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`🔄 Vote activity hook triggered for case: ${caseId}, count: ${voteCount}`);
      
      // Запускаємо голосування ботів
      await this.botnetService.handleVoteActivity(caseId, voteCount);
      
      this.logger.log(`✅ Botnet voting scheduled for case ${caseId} with ${voteCount} votes`);
      
      return {
        success: true,
        message: `Botnet voting scheduled for case ${caseId} with ${voteCount} votes`
      };
      
    } catch (error) {
      this.logger.error(`❌ Failed to schedule botnet voting for case ${caseId}: ${error.message}`);
      
      return {
        success: false,
        message: `Failed to schedule botnet voting: ${error.message}`
      };
    }
  }

  /**
   * Перевірка чи бот вже голосував за кейс
   */
  async hasBotVoted(botId: string, caseId: string): Promise<boolean> {
    try {
      const result = await this.votesService.didUserVote(caseId, botId);
      return result.voted;
    } catch (error) {
      this.logger.error(`❌ Failed to check vote status for bot ${botId}: ${error.message}`);
      return false;
    }
  }
}