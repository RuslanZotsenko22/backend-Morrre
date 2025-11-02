import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { WsJwtGuard } from '../common/guards/ws-jwt.guard';


@WebSocketGateway({ namespace: '/ws/chat', cors: { origin: true, credentials: true } })
export class ChatGateway {
  @WebSocketServer() io: Server;

  constructor(private readonly chat: ChatService) {}

  handleConnection(client: Socket) {
    
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('message:send')
  async onSend(@ConnectedSocket() client: Socket, @MessageBody() dto: any) {
    const userId = client.data.userId as string;
    const res = await this.chat.sendMessage(userId, dto.chatId, dto);
    this.io.to(dto.chatId).emit('message:new', res);
    return res;
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('chat:join')
  onJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: { chatId: string }) {
    client.join(payload.chatId);
    return { ok: true };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('chat:read')
  async onRead(@ConnectedSocket() client: Socket, @MessageBody() payload: { chatId: string; lastMessageId: string }) {
    const userId = client.data.userId as string;
    await this.chat.markRead(userId, payload.chatId, payload.lastMessageId);
    this.io.to(payload.chatId).emit('chat:read', { userId, chatId: payload.chatId, lastMessageId: payload.lastMessageId });
    return { ok: true };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('chat:pin')
  async onPin(@ConnectedSocket() client: Socket, @MessageBody() payload: { chatId: string; pin: boolean }) {
    const userId = client.data.userId as string;
    const res = await this.chat.pinChat(userId, payload.chatId, payload.pin);
    this.io.to(payload.chatId).emit('chat:updated', { chatId: payload.chatId, pinnedAt: res.pinnedAt });
    return res;
  }
}
