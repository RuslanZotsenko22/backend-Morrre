// src/votes/votes.controller.ts
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { VotesService } from './votes.service'
import { CreateVoteDto } from './dto/create-vote.dto'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard' 

@ApiTags('votes')
@Controller('cases')
export class VotesController {
  constructor(private readonly votes: VotesService) {}

  // --- GET: список голосів із курсорною пагінацією та фільтром role ---
  @Get(':caseId/votes')
  @ApiOperation({ summary: 'Список голосів по кейсу з курсорною пагінацією' })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ['all', 'user', 'jury'],
    description: 'Фільтр за роллю голосувальників'
  })
  @ApiQuery({ name: 'limit', required: false, description: 'К-сть елементів, 1..50 (деф. 12)' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Курсор з попередньої сторінки' })
  async list(
    @Param('caseId') caseId: string,
    @Query('role') role: 'all' | 'user' | 'jury' = 'all',
    @Query('limit') limit = '12',
    @Query('cursor') cursor?: string,
  ) {
    return this.votes.listByCase({ caseId, role, limit: Number(limit), cursor })
  }

  // --- POST: проголосувати за кейс (1 раз на користувача) ---
  @Post(':caseId/votes')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Проголосувати за кейс (1 раз на користувача)' })
  @ApiBody({ type: CreateVoteDto })
  async create(
    @Param('caseId') caseId: string,
    @Body() dto: CreateVoteDto,
    @Req() req: any,
  ) {
    const userId = req?.user?._id || req?.user?.id
    const data = await this.votes.create(caseId, userId, dto)
    return { ok: true, data }
  }

  @Get(':caseId/votes/me')
@UseGuards(JwtAuthGuard)
@ApiOperation({ summary: 'Чи голосував поточний користувач за кейс' })
async didIVote(@Param('caseId') caseId: string, @Req() req: any) {
  const userId = req?.user?._id || req?.user?.id
  return this.votes.didUserVote(caseId, userId)
}

}
