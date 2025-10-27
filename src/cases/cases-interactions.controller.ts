import { Body, Controller, Param, Post } from '@nestjs/common';
import { CasesService } from './cases.service';
import { InteractionDto } from './dto/interaction.dto';

@Controller('cases')
export class CasesInteractionsController {
  constructor(private readonly cases: CasesService) {}

  /** POST /api/cases/:id/interaction  { type: 'view'|'save'|'share'|'refLike', refId?, actor? } */
  @Post(':id/interaction')
  async register(
    @Param('id') caseId: string,
    @Body() dto: InteractionDto,
  ) {
    const res = await this.cases.registerInteraction(caseId, dto);
    return { ok: true, ...res };
  }
}
