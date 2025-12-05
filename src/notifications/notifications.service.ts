import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification, NotificationDocument } from './schemas/notification.schema';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
  ) {}

  async create(createNotificationDto: CreateNotificationDto): Promise<Notification> {
    const createdNotification = new this.notificationModel(createNotificationDto);
    return createdNotification.save();
  }

  async findByRecipient(recipientId: string): Promise<Notification[]> {
    return this.notificationModel
      .find({ recipient: recipientId })
      .populate('actor', 'username avatar')
      .sort({ createdAt: -1 })
      .exec();
  }

  async markAsRead(notificationId: string): Promise<Notification> {
    const notification = await this.notificationModel
      .findByIdAndUpdate(notificationId, { isRead: true }, { new: true })
      .exec();

    if (!notification) {
      throw new NotFoundException('Сповіщення не знайдено');
    }

    return notification;
  }

  async markAllAsRead(recipientId: string): Promise<void> {
    await this.notificationModel
      .updateMany({ recipient: recipientId, isRead: false }, { isRead: true })
      .exec();
  }

  async remove(notificationId: string): Promise<void> {
    await this.notificationModel.findByIdAndDelete(notificationId).exec();
  }
}