import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../common/guards/internal-secret.guard'
import { CollectionsService } from './collections.service'
import { CreateCollectionDto } from './dto/create-collection.dto'
import { UpdateCollectionDto } from './dto/update-collection.dto'

@UseGuards(InternalSecretGuard)
@Controller('internal/collections') 
export class InternalCollectionsController {
  constructor(private readonly svc: CollectionsService) {}

  @Post('create')
  create(@Body() dto: CreateCollectionDto) {
    return this.svc.create(dto)
  }

  @Post('update')
  update(@Body() body: { id: string } & UpdateCollectionDto) {
    const { id, ...patch } = body
    return this.svc.update(id, patch)
  }

  @Post('delete')
  remove(@Body() body: { id: string }) {
    return this.svc.remove(body.id)
  }

  @Post('reorder')
  reorder(@Body() body: { items: { id: string; order: number }[] }) {
    if (!Array.isArray(body.items)) throw new BadRequestException('items[] required')
    return this.svc.bulkReorder(body.items)
  }

  @Post('set-cases')
  setCases(@Body() body: { id: string; cases: string[] }) {
    return this.svc.setCasesOrder(body.id, body.cases)
  }
}
