import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search.query.dto';

@Controller('search')
export class SearchController {
  constructor(private readonly svc: SearchService) {}

  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @Get()
  async search(@Query() query: SearchQueryDto) {
    const res = await this.svc.search(query);
    return res;
  }
}
