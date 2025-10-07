import { Controller, Get, Param, Query } from '@nestjs/common'
import { CollectionsService } from './collections.service'

@Controller('collections') // -> /api/collections
export class CollectionsController {
  constructor(private readonly svc: CollectionsService) {}

  /** GET /api/collections/featured?limit=6 */
  @Get('featured')
  getFeatured(@Query('limit') limit?: string) {
    return this.svc.getFeatured(Number(limit))
  }

  /** GET /api/collections?page=1&limit=20 */
  @Get()
  list(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.svc.list({ page: Number(page), limit: Number(limit) })
  }

  /** GET /api/collections/:slug */
  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.svc.bySlug(slug)
  }
}
