import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Chat, ChatDocument } from './schemas/chat.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import { ListChatsQueryDto } from './dto/list-chats.dto';
import { ListMessagesQueryDto } from './dto/list-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Chat.name) private readonly ChatModel: Model<ChatDocument>,
    @InjectModel(Message.name) private readonly MessageModel: Model<MessageDocument>,
  ) {}

  private toId(id: string) { return new Types.ObjectId(id); }

  async createOrGetChat(userId: string, otherId: string) {
    if (userId === otherId) throw new BadRequestException('Cannot chat with yourself');
    const a = this.toId(userId); const b = this.toId(otherId);

    let chat = await this.ChatModel.findOne({ participants: { $all: [a, b], $size: 2 } });
    if (!chat) {
      chat = await this.ChatModel.create({
        participants: [a, b],
        lastMessageId: null,
        userMeta: [{ userId: a, unreadCount: 0 }, { userId: b, unreadCount: 0 }],
      });
    }
    return { chatId: chat._id.toString() };
  }

  async listChats(userId: string, q: ListChatsQueryDto) {
    const uid = this.toId(userId);
    const limit = Math.min(parseInt(q.limit ?? '30', 10), 50);
    const match: any = { participants: uid };

   const pipeline: any[] = [
  { $match: match },
  // opponent info
  {
    $addFields: {
      opponentId: {
        $let: {
          vars: { p: '$participants' },
          in: {
            $arrayElemAt: [
              {
                $filter: {
                  input: '$$p',
                  as: 'x',
                  cond: { $ne: ['$$x', uid] },
                },
              },
              0,
            ],
          },
        },
      },
    },
  },
  { $lookup: { from: 'users', localField: 'opponentId', foreignField: '_id', as: 'opponent' } },
  { $unwind: '$opponent' },

  
  {
    $addFields: {
      meMeta: {
        $arrayElemAt: [
          {
            $filter: {
              input: '$userMeta',
              as: 'm',
              cond: { $eq: ['$$m.userId', uid] },
            },
          },
          0,
        ],
      },
    },
  },

  
  { $match: { 'meMeta.hiddenAt': { $exists: false } } },

  
  ...(q.q
    ? [
        {
          $match: {
            $or: [
              { 'opponent.name': { $regex: q.q, $options: 'i' } },
              { 'opponent.about': { $regex: q.q, $options: 'i' } },
            ],
          },
        },
      ]
    : []),

  
  ...(q.pinnedOnly === 'true'
    ? [{ $match: { 'meMeta.pinnedAt': { $exists: true, $ne: null } } }]
    : []),

  
  {
    $lookup: {
      from: 'messages',
      localField: 'lastMessageId',
      foreignField: '_id',
      as: 'lastMessage',
    },
  },
  { $unwind: { path: '$lastMessage', preserveNullAndEmptyArrays: true } },

  
  {
    $project: {
      _id: 1,
      updatedAt: 1,
      unreadCount: '$meMeta.unreadCount',
      pinnedAt: '$meMeta.pinnedAt',
      opponent: {
        id: '$opponent._id',
        name: '$opponent.name',
        avatar: '$opponent.avatar',
        about: '$opponent.about',
      },
      lastMessage: {
        id: '$lastMessage._id',
        type: '$lastMessage.type',
        text: '$lastMessage.text',
        createdAt: '$lastMessage.createdAt',
        isEdited: '$lastMessage.edited.isEdited',
        isDeleted: { $in: [uid, '$lastMessage.deletedFor'] },
      },
    },
  },
  { $sort: { pinnedAt: -1, updatedAt: -1 } },
  { $limit: limit },
];

    return this.ChatModel.aggregate(pipeline);
  }

  async listMessages(userId: string, chatId: string, q: ListMessagesQueryDto) {
    const uid = this.toId(userId);
    const cid = this.toId(chatId);
    const chat = await this.ChatModel.findById(cid);
    if (!chat) throw new NotFoundException('Chat not found');
    if (!chat.participants.some(p => p.equals(uid))) throw new ForbiddenException();

    const limit = Math.min(parseInt(q.limit ?? '40', 10), 100);
    const filter: any = { chatId: cid };

    if (q.beforeId) filter._id = { ...(filter._id || {}), $lt: this.toId(q.beforeId) };
    if (q.afterId)  filter._id = { ...(filter._id || {}), $gt: this.toId(q.afterId) };

    const docs = await this.MessageModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit)
      .lean();

    
    const res = docs.map(d => ({
      id: d._id.toString(),
      from: d.from.toString(),
      to: d.to.toString(),
      type: d.type,
      text: (d.deletedFor?.some(x => x.equals(uid))) ? undefined : d.text,
      media: (d.deletedFor?.some(x => x.equals(uid))) ? undefined : d.media,
      templateKey: d.templateKey,
      isEdited: d.edited?.isEdited ?? false,
      isDeleted: d.deletedFor?.some(x => x.equals(uid)) ?? false,
      createdAt: d.createdAt,
    }));

    return res.reverse(); 
  }

  async pinChat(userId: string, chatId: string, pin: boolean) {
    const uid = this.toId(userId), cid = this.toId(chatId);
    const chat = await this.ChatModel.findById(cid);
    if (!chat) throw new NotFoundException();

    const meta = chat.userMeta.find(m => m.userId.equals(uid));
    if (!meta) throw new ForbiddenException();

    meta.pinnedAt = pin ? new Date() : undefined;
    await chat.save();
    return { ok: true, pinnedAt: meta.pinnedAt };
  }

  async markRead(userId: string, chatId: string, lastMessageId: string) {
    const uid = this.toId(userId), cid = this.toId(chatId);
    const chat = await this.ChatModel.findById(cid);
    if (!chat) throw new NotFoundException();

    const meta = chat.userMeta.find(m => m.userId.equals(uid));
    if (!meta) throw new ForbiddenException();

    meta.lastReadAt = new Date();
    meta.unreadCount = 0;
    await chat.save();
    return { ok: true };
  }

  async hideForUser(userId: string, chatId: string) {
    const uid = this.toId(userId), cid = this.toId(chatId);
    const chat = await this.ChatModel.findById(cid);
    if (!chat) throw new NotFoundException();

    const meta = chat.userMeta.find(m => m.userId.equals(uid));
    if (!meta) throw new ForbiddenException();

    meta.hiddenAt = new Date();
    await chat.save();
    return { ok: true };
  }

  async sendMessage(userId: string, chatId: string, dto: SendMessageDto) {
    const uid = this.toId(userId), cid = this.toId(chatId);
    const chat = await this.ChatModel.findById(cid);
    if (!chat) throw new NotFoundException();

    if (!chat.participants.some(p => p.equals(uid))) throw new ForbiddenException();

    const opponentId = chat.participants.find(p => !p.equals(uid))!;
    
    if (dto.type === 'text' && (!dto.text || !dto.text.trim())) {
      throw new BadRequestException('Text is required');
    }
    if (dto.type === 'media') {
      if (!dto.media?.length) throw new BadRequestException('media[] required');
      const tooBig = dto.media.find(m => Number(m.size ?? 0) > 25 * 1024 * 1024);
      if (tooBig) throw new BadRequestException('File too large (>25MB)');
    }
    
    const msg = await this.MessageModel.create({
      chatId: cid,
      from: uid,
      to: opponentId,
      type: dto.type,
      text: dto.text,
      media: dto.media?.map(m => ({
        publicId: m.publicId, url: m.url, mime: m.mime,
        size: Number(m.size ?? 0),
        width: Number(m.width ?? 0) || undefined,
        height: Number(m.height ?? 0) || undefined,
      })),
      templateKey: dto.templateKey,
      edited: { isEdited: false, at: null, count: 0 },
      deletedFor: [],
      status: 'sent',
    });

    
    chat.lastMessageId = msg._id;
    for (const m of chat.userMeta) {
      if (m.userId.equals(opponentId)) m.unreadCount = (m.unreadCount || 0) + 1;
      if (m.userId.equals(uid) && m.hiddenAt) m.hiddenAt = undefined; 
    }
    await chat.save();

    return {
      id: msg._id.toString(),
      chatId,
      from: userId,
      to: opponentId.toString(),
      type: msg.type,
      text: msg.text,
      media: msg.media,
      templateKey: msg.templateKey,
      isEdited: false,
      isDeleted: false,
      createdAt: msg.createdAt,
    };
  }

  async updateMessage(userId: string, messageId: string, dto: UpdateMessageDto) {
    const uid = this.toId(userId);
    const mid = this.toId(messageId);
    const msg = await this.MessageModel.findById(mid);
    if (!msg) throw new NotFoundException('Message not found');
    if (!msg.from.equals(uid)) throw new ForbiddenException('You can edit only your messages');

    msg.text = dto.text;
    msg.edited = { isEdited: true, at: new Date(), count: (msg.edited?.count ?? 0) + 1 };
    await msg.save();

    return { id: msg._id.toString(), isEdited: true, text: msg.text, editedAt: msg.edited.at };
  }

  async deleteMessageForUser(userId: string, messageId: string) {
    const uid = this.toId(userId);
    const mid = this.toId(messageId);
    const msg = await this.MessageModel.findById(mid);
    if (!msg) throw new NotFoundException('Message not found');
    if (!msg.from.equals(uid) && !msg.to.equals(uid)) throw new ForbiddenException();

    if (!msg.deletedFor.some(x => x.equals(uid))) {
      msg.deletedFor.push(uid);
      await msg.save();
    }
    return { id: msg._id.toString(), isDeleted: true };
  }

  
  async searchMessages(userId: string, q: string) {
    const uid = this.toId(userId);
    if (!q?.trim()) return [];
    
    const chats = await this.ChatModel.find({ participants: uid }).select('_id participants').lean();
    const chatIds = chats.map(c => c._id);

    const docs = await this.MessageModel.find({
      chatId: { $in: chatIds },
      $text: { $search: q },
    }).sort({ createdAt: -1 }).limit(50).lean();

    
    const mapOpponent = new Map<string, string>(); 
    for (const c of chats) {
      const opp = (c.participants as Types.ObjectId[]).find(p => !p.equals(uid))!;
      mapOpponent.set(c._id.toString(), opp.toString());
    }

    return docs.map(d => ({
      id: d._id.toString(),
      chatId: d.chatId.toString(),
      opponentId: mapOpponent.get(d.chatId.toString()),
      type: d.type,
      snippet: d.text,
      createdAt: d.createdAt,
    }));
  }

    /**
   * Забезпечує існування чату між двома користувачами.
   * Якщо чату ще нема — створює новий.
   */
  async ensureChatBetween(userId: string, targetId: string) {
    if (userId === targetId) throw new BadRequestException('Cannot chat with yourself');
    const a = this.toId(userId);
    const b = this.toId(targetId);

    let chat = await this.ChatModel.findOne({
      participants: { $all: [a, b], $size: 2 },
    });

    if (!chat) {
      chat = await this.ChatModel.create({
        participants: [a, b],
        userMeta: [
          { userId: a, unreadCount: 0 },
          { userId: b, unreadCount: 0 },
        ],
        lastMessageId: null,
      });
    }

    return chat;
  }

  /**
   * Відправляє шаблонне повідомлення (hire-заявка)
   * з типом 'template' у чат.
   */
  async sendTemplateMessage(fromId: string, toId: string, payload: {
    title: string;
    description: string;
    budget?: number;
    timeline?: string;
  }) {
    const chat = await this.ensureChatBetween(fromId, toId);
    const from = this.toId(fromId);
    const to = this.toId(toId);

    const msg = await this.MessageModel.create({
      chatId: chat._id,
      from,
      to,
      type: 'template',
      text: `${payload.title}\n\n${payload.description}`,
      templateKey: 'hire_request',
      meta: {
        budget: payload.budget ?? null,
        timeline: payload.timeline ?? null,
      },
      edited: { isEdited: false, at: null, count: 0 },
      deletedFor: [],
      status: 'sent',
    });

    chat.lastMessageId = msg._id;
    for (const m of chat.userMeta) {
      if (m.userId.equals(to)) m.unreadCount = (m.unreadCount || 0) + 1;
    }
    await chat.save();

    return {
      chatId: chat._id.toString(),
      messageId: msg._id.toString(),
      type: msg.type,
      text: msg.text,
      meta: msg.meta,
      createdAt: msg.createdAt,
    };
  }


}
