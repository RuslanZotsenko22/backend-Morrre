import { CollectionConfig } from 'payload/types';

export const BotnetQueue: CollectionConfig = {
  slug: 'botnet-queue',
  admin: {
    useAsTitle: 'actionType',
    group: 'Botnet',
    defaultColumns: ['actionType', 'targetType', 'status', 'scheduledFor', 'bot'],
  },

  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },

  fields: [
    {
      name: 'bot',
      type: 'relationship',
      relationTo: 'bots',
      required: true,
      admin: {
        description: 'Бот, який виконує завдання',
      },
    },
    {
      name: 'actionType',
      type: 'select',
      options: [
        {
          label: 'Голосувати за кейс',
          value: 'vote',
        },
        {
          label: 'Підписатися на користувача',
          value: 'subscribe',
        },
        {
          label: 'Лайкнути референс',
          value: 'like',
        },
        {
          label: 'Коментувати референс',
          value: 'comment',
        },
        {
          label: 'Забрати референс',
          value: 'take_reference',
        },
      ],
      required: true,
      admin: {
        description: 'Тип дії, яку виконує бот',
      },
    },
    {
      name: 'targetType',
      type: 'select',
      options: [
        {
          label: 'Кейс',
          value: 'case',
        },
        {
          label: 'Референс',
          value: 'reference',
        },
        {
          label: 'Користувач',
          value: 'user',
        },
      ],
      required: true,
      admin: {
        description: 'Тип цілі, на яку спрямована дія',
      },
    },
    {
      name: 'targetId',
      type: 'text',
      required: true,
      admin: {
        description: 'ID цілі (кейсу, референсу або користувача)',
      },
    },
    {
      name: 'scheduledFor',
      type: 'date',
      required: true,
      admin: {
        description: 'Коли завдання має бути виконане (з рандомною затримкою 2-4 хвилини)',
      },
    },
    {
      name: 'status',
      type: 'select',
      options: [
        {
          label: 'В очікуванні',
          value: 'pending',
        },
        {
          label: 'Виконується',
          value: 'in-progress',
        },
        {
          label: 'Завершено',
          value: 'completed',
        },
        {
          label: 'Помилка',
          value: 'failed',
        },
      ],
      defaultValue: 'pending',
      admin: {
        description: 'Статус виконання завдання',
      },
    },
    {
      name: 'attempts',
      type: 'number',
      defaultValue: 0,
      admin: {
        description: 'Кількість спроб виконання',
        readOnly: true,
      },
    },
    {
      name: 'lastAttempt',
      type: 'date',
      admin: {
        description: 'Остання спроба виконання',
        readOnly: true,
      },
    },
    {
      name: 'errorMessage',
      type: 'text',
      admin: {
        description: 'Повідомлення про помилку (якщо є)',
        readOnly: true,
      },
    },
  ],
  timestamps: true,
};