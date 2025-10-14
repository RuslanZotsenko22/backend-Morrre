import {
  Body,
  Controller,
  Get,
  Param,
  Delete,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common'
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CaseDraftsService } from './case-drafts.service'
import { UpsertSectionDto, DraftMetaDto } from './dto/draft.dto'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  imageFileFilter,
  imageStorageForDraft,
  MAX_IMAGE_SIZE,
} from './uploads/image-upload.util'
import type { Request, Express } from 'express'
import { UpdateBlockDto } from './dto/block-update.dto'


@ApiTags('case-drafts')
@UseGuards(JwtAuthGuard)
@Controller('case-drafts')
export class CaseDraftsController {
  constructor(private readonly drafts: CaseDraftsService) {}

  @Post()
  @ApiOperation({ summary: 'Створити чернетку (24h TTL)' })
  async create(@Req() req: Request) {
    // @ts-ignore
    const ownerId = req.user?.userId
    return this.drafts.create(ownerId)
  }

  @Get(':draftId')
  @ApiOperation({ summary: 'Отримати чернетку' })
  async get(@Req() req: Request, @Param('draftId') draftId: string) {
    // @ts-ignore
    const ownerId = req.user?.userId
    return this.drafts.get(ownerId, draftId)
  }

  @Patch(':draftId/section')
  @ApiOperation({ summary: 'Додати/оновити секцію (blocks 1..3)' })
  async upsertSection(
    @Req() req: Request,
    @Param('draftId') draftId: string,
    @Body() dto: UpsertSectionDto,
  ) {
    // @ts-ignore
    const ownerId = req.user?.userId
    return this.drafts.upsertSection(ownerId, draftId, dto)
  }

  @Patch(':draftId/meta')
  @ApiOperation({ summary: 'Крок 2: заголовок/індустрія/категорії/теги' })
  async setMeta(
    @Req() req: Request,
    @Param('draftId') draftId: string,
    @Body() dto: DraftMetaDto,
  ) {
    // @ts-ignore
    const ownerId = req.user?.userId
    return this.drafts.setMeta(ownerId, draftId, dto)
  }

  @Post(':draftId/sections/:sectionIdx/blocks/:blockIdx/image')
  @ApiOperation({ summary: 'Завантажити зображення у блок (≤20MB)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: (req) => imageStorageForDraft(req.params.draftId),
      fileFilter: imageFileFilter,
      limits: { fileSize: MAX_IMAGE_SIZE },
    }),
  )
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  async uploadImage(
    @Req() req: Request,
    @Param('draftId') draftId: string,
    @Param('sectionIdx') sectionIdx: string,
    @Param('blockIdx') blockIdx: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // @ts-ignore
    const ownerId = req.user?.userId
    return this.drafts.attachImageToBlock(
      ownerId,
      draftId,
      Number(sectionIdx),
      Number(blockIdx),
      file,
    )
  }

  // Відео -> Vimeo (через чергу)
  @Post(':draftId/sections/:sectionIdx/blocks/:blockIdx/video')
  @ApiOperation({ summary: 'Завантажити відео у Vimeo через чергу (rate-limited)' })
  async uploadVideo(
    @Req() req: Request,
    @Param('draftId') draftId: string,
    @Param('sectionIdx') sectionIdx: string,
    @Param('blockIdx') blockIdx: string,
    @Body('tmpPath') tmpPath: string,
  ) {
    // @ts-ignore
    const ownerId = req.user?.userId
    return this.drafts.attachVideoToBlock(
      ownerId,
      draftId,
      Number(sectionIdx),
      Number(blockIdx),
      tmpPath,
    )
  }

  @Post(':draftId/publish')
  @ApiOperation({ summary: 'Публікація чернетки → створити Case, видалити Draft' })
  async publish(@Req() req: Request, @Param('draftId') draftId: string) {
    // @ts-ignore
    const ownerId = req.user?.userId
    return this.drafts.publish(ownerId, draftId)
  }

  
}
