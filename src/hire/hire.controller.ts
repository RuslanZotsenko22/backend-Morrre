import {
  Controller, Post, Param, Body, UseInterceptors, UploadedFiles,
  ParseFilePipeBuilder, HttpStatus, Get, Query, Req
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import * as path from 'path'
import { CreateHireRequestDto } from './dto/create-hire-request.dto'
import { HireService } from './hire.service'

// конфіг завантаження (25MB/файл, до 5 файлів)
const MAX_FILES = Number(process.env.HIRE_MAX_FILES ?? 5)
const MAX_FILE_SIZE = Number(process.env.HIRE_MAX_FILE_MB ?? 25) * 1024 * 1024

function storageFactory() {
  const dest = process.env.HIRE_UPLOAD_DIR || path.resolve(process.cwd(), 'uploads', 'hire')
  return diskStorage({
    destination: dest,
    filename: (_, file, cb) => {
      const ext = path.extname(file.originalname)
      const base = path.basename(file.originalname, ext).replace(/\s+/g, '-').toLowerCase()
      const name = `${base}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`
      cb(null, name)
    },
  })
}

@Controller('hire')
export class HireController {
  constructor(private readonly hire: HireService) {}

  /**
   * Створити hire-запит для користувача :userId
   * multipart/form-data: fields + files[]
   * Якщо є авторизація — витягуй userId із req.user (тут просто як приклад)
   */
  @Post(':userId/request')
  @UseInterceptors(FilesInterceptor('files', MAX_FILES, {
    storage: storageFactory(),
    limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  }))
  async createRequest(
    @Param('userId') userId: string,
    @Body() dto: CreateHireRequestDto,
    @UploadedFiles(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: MAX_FILE_SIZE })
        .build({ errorHttpStatusCode: HttpStatus.PAYLOAD_TOO_LARGE }),
    ) files: Express.Multer.File[] = [],
    @Req() req: any,
  ) {
    const fromUserId = req?.user?._id || req?.user?.id // якщо є авторизація
    const data = await this.hire.create(userId, dto, files, fromUserId)
    return { ok: true, data }
  }

  /** Список заявок для автора (отримувача) */
  @Get(':userId/inbox')
  async inbox(@Param('userId') userId: string, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.hire.listForUser(userId, Number(limit), Number(page))
  }
}
