
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express } from 'express';

import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
// ⬇ Лишаємо тільки відео-малтер
import { uploadVideoMulter } from '../media/upload.util';
import { MediaService } from '../media/cloudinary.service';
import { VideoQueue } from '../queue/video.queue';

@Controller('cases') // із глобальним prefix 'api' -> /api/cases
export class CasesController {
  constructor(
    private readonly cases: CasesService,
    private readonly media: MediaService,
    private readonly videoQueue: VideoQueue,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req, @Body() dto: CreateCaseDto) {
    return this.cases.create(req.user.userId, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cases.findPublicById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Req() req, @Param('id') id: string, @Body() dto: UpdateCaseDto) {
    return this.cases.updateOwned(req.user.userId, id, dto);
  }

  // ===== Cover: файл АБО JSON url =====
  @UseGuards(JwtAuthGuard)
  @Post(':id/cover')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadCover(
    @Req() req,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ) {
    const userId = req.user?.userId ?? req.user?.id ?? req.user?.sub;

    if (body?.url && typeof body.url === 'string') {
      const sizes = body.sizes && typeof body.sizes === 'object' ? body.sizes : undefined;
      return this.cases.setCover(userId, id, {
        type: 'image',
        url: body.url,
        alt: body.alt,
        sizes,
      } as any);
    }

    if (!file) {
      throw new BadRequestException(
        'Provide either "url" in JSON body or a file in form-data field "file".',
      );
    }

    const sizes = await this.media.uploadImageVariants(file); // { low, mid, full }
    return this.cases.setCover(userId, id, {
      type: 'image',
      url: sizes.full,
      sizes,
    } as any);
  }

  // ===== Video: зберігаємо на диск, кидаємо у BullMQ =====
  @UseGuards(JwtAuthGuard)
  @Post(':id/videos')
  @UseInterceptors(FileInterceptor('file', uploadVideoMulter))
  async addVideo(
    @Req() req,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file?.path) {
      throw new BadRequestException('Video file is required (form-data field "file")');
    }

    await this.cases.pushVideoMeta(id, {
      status: 'queued',
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    });

    await this.videoQueue.enqueueUpload({ caseId: id, filePath: file.path });

    return { queued: true, filename: file.filename };
  }
}
