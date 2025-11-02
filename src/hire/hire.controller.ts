import {
  Controller, Post, Param, Body, UseInterceptors, UploadedFiles,
  ParseFilePipeBuilder, HttpStatus, Get, Query, Req, Inject, forwardRef
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import { CreateHireRequestDto } from './dto/create-hire-request.dto';
import { HireService } from './hire.service';
import { ChatService } from '../chat/chat.service';

const MAX_FILES = Number(process.env.HIRE_MAX_FILES ?? 5);
const MAX_FILE_SIZE = Number(process.env.HIRE_MAX_FILE_MB ?? 25) * 1024 * 1024;

function storageFactory() {
  const dest = process.env.HIRE_UPLOAD_DIR || path.resolve(process.cwd(), 'uploads', 'hire');
  return diskStorage({
    destination: dest,
    filename: (_, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext).replace(/\s+/g, '-').toLowerCase();
      const name = `${base}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
      cb(null, name);
    },
  });
}

@Controller('hire')
export class HireController {
  constructor(
    private readonly hire: HireService,
    @Inject(forwardRef(() => ChatService))
    private readonly chat: ChatService,
  ) {}

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
    const fromUserId = req?.user?._id || req?.user?.id;
    
    
    const hireData = await this.hire.create(userId, dto, files, fromUserId);

   const chatMsg = await this.chat.sendTemplateMessage(fromUserId, userId, {
  title: dto.title ?? 'New hire request',
  description: dto.description ?? '',
  budget: dto.budget ? Number(dto.budget) : undefined,
  timeline: (dto as any).timeline ?? undefined, 
});

    
    return {
      ok: true,
      hire: hireData,
      chat: chatMsg,
    };
  }

  @Get(':userId/inbox')
  async inbox(
    @Param('userId') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.hire.listForUser(userId, Number(limit), Number(page));
  }
}
