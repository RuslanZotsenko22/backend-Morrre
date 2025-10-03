import { Controller, Get, Query } from '@nestjs/common';
import { CasesService } from '../cases/cases.service';

@Controller('home')
export class HomeController {
  constructor(private readonly cases: CasesService) {}

  /**
   * Popular today (слайди) — ручний вибір у CMS (featuredSlides=true), 3..6
   */
  @Get('popular-today')
  async popularToday(@Query('limit') limit = '6') {
    const n = Math.min(Math.max(parseInt(limit, 10) || 6, 1), 12);
    const items = await this.cases.findPopularSlides(n);
    return { items };
  }

  /**
   * Discover — повертає останній опублікований батч (popularBatchDate)
   * опційно фільтр за категорією
   */
  @Get('discover')
  async discover(@Query('category') category?: string, @Query('limit') limit = '8') {
    const n = Math.min(Math.max(parseInt(limit, 10) || 8, 1), 24);
    const items = await this.cases.findDiscoverBatch({ category, limit: n });
    return { items };
  }
}
