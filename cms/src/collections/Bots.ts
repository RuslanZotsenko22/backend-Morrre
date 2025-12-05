import { CollectionConfig } from 'payload/types';

export const Bots: CollectionConfig = {
  slug: 'bots',
  admin: {
    useAsTitle: 'username',
    group: 'Botnet',
    defaultColumns: ['username', 'status', 'canVote', 'lastActivity'],
  },

  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },

  fields: [
    {
      name: 'username',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Унікальне ім\'я бота',
      },
    },
    {
      name: 'avatar',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Аватарка бота (обов\'язково для тих, хто може голосувати)',
      },
    },
    {
      name: 'canVote',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Чи може бот голосувати за кейси (тільки 80 ботів з аватарками)',
      },
    },
    {
      name: 'lastActivity',
      type: 'date',
      admin: {
        description: 'Коли бот востаннє був активний',
        readOnly: true,
      },
    },
    {
      name: 'activityCount',
      type: 'number',
      defaultValue: 0,
      admin: {
        description: 'Загальна кількість активностей бота',
        readOnly: true,
      },
    },
    {
      name: 'status',
      type: 'select',
      options: [
        {
          label: 'Активний',
          value: 'active',
        },
        {
          label: 'Неактивний',
          value: 'inactive',
        },
        {
          label: 'Мертвий',
          value: 'dead',
        },
      ],
      defaultValue: 'active',
      admin: {
        description: 'Статус бота в системі',
      },
    },
    {
      name: 'isBot',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        hidden: true, // Ховаємо, щоб не плутати з реальними користувачами
      },
    },
  ],
  timestamps: true,
};