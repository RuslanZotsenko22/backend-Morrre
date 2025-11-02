import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ListChatsQueryDto } from './dto/list-chats.dto';
import { ListMessagesQueryDto } from './dto/list-messages.dto';
import { PinDto } from './dto/pin.dto';
import { ReadDto } from './dto/read.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('chats')
  myChats(@Req() req, @Query() q: ListChatsQueryDto) {
    return this.chat.listChats(req.user.userId, q);
  }

  @Post('chats/:userId')
  createOrGet(@Req() req, @Param('userId') userId: string) {
    return this.chat.createOrGetChat(req.user.userId, userId);
  }

  @Patch('chats/:chatId/pin')
  pin(@Req() req, @Param('chatId') id: string, @Body() dto: PinDto) {
    return this.chat.pinChat(req.user.userId, id, dto.pin);
  }

  @Patch('chats/:chatId/read')
  read(@Req() req, @Param('chatId') id: string, @Body() dto: ReadDto) {
    return this.chat.markRead(req.user.userId, id, dto.lastMessageId);
  }

  @Delete('chats/:chatId')
  hide(@Req() req, @Param('chatId') id: string) {
    return this.chat.hideForUser(req.user.userId, id);
  }

  @Get('chats/:chatId/messages')
  history(@Req() req, @Param('chatId') id: string, @Query() q: ListMessagesQueryDto) {
    return this.chat.listMessages(req.user.userId, id, q);
  }

  @Post('chats/:chatId/messages')
  send(@Req() req, @Param('chatId') id: string, @Body() dto: SendMessageDto) {
    return this.chat.sendMessage(req.user.userId, id, dto);
  }

  @Patch('messages/:id')
  updateMsg(@Req() req, @Param('id') id: string, @Body() dto: UpdateMessageDto) {
    return this.chat.updateMessage(req.user.userId, id, dto);
  }

  @Delete('messages/:id')
  deleteMsg(@Req() req, @Param('id') id: string) {
    return this.chat.deleteMessageForUser(req.user.userId, id);
  }

  @Get('search/messages')
  search(@Req() req, @Query('q') q: string) {
    return this.chat.searchMessages(req.user.userId, q);
  }
}
