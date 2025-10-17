import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { CasesService } from './cases.service';

@Controller('internal/cases') 
export class InternalCasesController {
  constructor(private readonly cases: CasesService) {}

  private ensureInternalSecret(secret?: string) {
    const expected = process.env.INTERNAL_SECRET || '';
    if (!expected || secret !== expected) {
      
      const e: any = new Error('Forbidden');
      e.status = 403;
      throw e;
    }
  }

  
  @Post(':id/rebuild-palette')
  async rebuildPalette(
    @Param('id') id: string,
    @Headers('x-internal-secret') secret?: string,
    @Body() body?: { force?: boolean },
  ) {
    this.ensureInternalSecret(secret);
    return this.cases.rebuildPalette(id, { force: !!body?.force });
  }
}
