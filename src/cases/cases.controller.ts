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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { uploadImageMulter } from '../media/upload.util';
import { MediaService } from '../media/cloudinary.service';
import { VideoQueue } from '../queue/video.queue';

@Controller('cases')
export class CasesController {
  constructor(
    private readonly cases: CasesService,
    private readonly media: MediaService,
    private readonly videoQueue: VideoQueue, // ✅ інжекція черги через конструктор
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

  // Завантаження обкладинки -> Cloudinary + webp варіанти
  @UseGuards(JwtAuthGuard)
  @Post(':id/cover')
  @UseInterceptors(FileInterceptor('file', uploadImageMulter))
  async uploadCover(
    @Req() req,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const sizes = await this.media.uploadImageVariants(file); // { low, mid, full }
    return this.cases.setCover(req.user.userId, id, {
      url: sizes.full,
      type: 'image',
      sizes,
    });
  }

  // ✅ ДОДАНО ПРАВИЛЬНО: метод всередині класу, без private в параметрах
  @UseGuards(JwtAuthGuard)
  @Post(':id/videos')
  @UseInterceptors(FileInterceptor('file', uploadImageMulter)) // за потреби зроби окремий multer для відео
  async addVideo(
    @Req() req,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // одразу пишемо статус у БД як queued
    await this.cases.pushVideoMeta(id, { status: 'queued' });

    // додаємо завдання в чергу на завантаження у Vimeo
    await this.videoQueue.enqueueUpload({ caseId: id, filePath: file.path });

    return { queued: true };
  }
}
