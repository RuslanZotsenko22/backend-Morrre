import { CollectionConfig } from 'payload/types';

export const BotnetSettings: CollectionConfig = {
  slug: 'botnet-settings',
  admin: {
    useAsTitle: 'name',
    group: 'Botnet',
  },

access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },

  fields: [
    {
      name: 'name',
      type: 'text',
      defaultValue: 'Налаштування ботнету',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'isEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description: 'Увімкнути/вимкнути всю систему ботнету',
      },
    },
    {
      name: 'timingSettings',
      type: 'group',
      label: 'Налаштування таймінгів',
      fields: [
        {
          name: 'minDelay',
          type: 'number',
          defaultValue: 2,
          admin: {
            description: 'Мінімальна затримка між діями ботів (хвилини)',
          },
        },
        {
          name: 'maxDelay',
          type: 'number',
          defaultValue: 4,
          admin: {
            description: 'Максимальна затримка між діями ботів (хвилини)',
          },
        },
        {
          name: 'caseActivationDelayMin',
          type: 'number',
          defaultValue: 10,
          admin: {
            description: 'Мінімальна затримка перед активністю на новий кейс (хвилини)',
          },
        },
        {
          name: 'caseActivationDelayMax',
          type: 'number',
          defaultValue: 20,
          admin: {
            description: 'Максимальна затримка перед активністю на новий кейс (хвилины)',
          },
        },
      ],
    },
    {
      name: 'queueSettings',
      type: 'group',
      label: 'Налаштування черг',
      fields: [
        {
          name: 'queues',
          type: 'array',
          fields: [
            {
              name: 'name',
              type: 'text',
              required: true,
              admin: {
                placeholder: 'Назва черги (напр. "Перша хвиля")',
              },
            },
            {
              name: 'minBots',
              type: 'number',
              required: true,
              admin: {
                placeholder: 'Мінімум ботів',
              },
            },
            {
              name: 'maxBots',
              type: 'number',
              required: true,
              admin: {
                placeholder: 'Максимум ботів',
              },
            },
          ],
          defaultValue: [
            {
              name: 'Перша хвиля',
              minBots: 34,
              maxBots: 56,
            },
            {
              name: 'Друга хвиля',
              minBots: 57,
              maxBots: 102,
            },
            {
              name: 'Третя хвиля',
              minBots: 103,
              maxBots: 231,
            },
          ],
        },
        {
          name: 'maxTotalBots',
          type: 'number',
          defaultValue: 349,
          admin: {
            description: 'Максимальна кількість ботів в одному бусті активності',
          },
        },
      ],
    },
    {
      name: 'organicSettings',
      type: 'group',
      label: 'Налаштування органічності',
      fields: [
        {
          name: 'organicRatio',
          type: 'number',
          defaultValue: 0.3,
          min: 0,
          max: 1,
          admin: {
            step: 0.1,
            description: 'Коефіцієнт органічності (0-1). Чим вище, тим більше враховується реальна активність',
          },
        },
        {
          name: 'realActivityMultiplier',
          type: 'number',
          defaultValue: 2,
          min: 1,
          max: 5,
          admin: {
            description: 'Множник реальної активності для визначення кількості ботів',
          },
        },
        {
          name: 'minRealActivityForBoost',
          type: 'number',
          defaultValue: 5,
          admin: {
            description: 'Мінімальна реальна активність для запуску бусту',
          },
        },
      ],
    },
    {
      name: 'votingSettings',
      type: 'group',
      label: 'Налаштування голосування',
      fields: [
        {
          name: 'minRating',
          type: 'number',
          defaultValue: 7.0,
          admin: {
            description: 'Мінімальна оцінка (7.N)',
          },
        },
        {
          name: 'maxRating',
          type: 'number',
          defaultValue: 8.9,
          admin: {
            description: 'Максимальна оцінка (8.N)',
          },
        },
        {
          name: 'votingBotsCount',
          type: 'number',
          defaultValue: 80,
          admin: {
            description: 'Кількість ботів, які можуть голосувати (мають аватарки)',
          },
        },
      ],
    },
    {
      name: 'referenceSettings',
      type: 'group',
      label: 'Налаштування референсів',
      fields: [
        {
          name: 'minLikesPerReference',
          type: 'number',
          defaultValue: 5,
          admin: {
            description: 'Мінімум лайків на референс від ботів',
          },
        },
        {
          name: 'maxLikesPerReference',
          type: 'number',
          defaultValue: 15,
          admin: {
            description: 'Максимум лайків на референс від ботів',
          },
        },
      ],
    },
  ],
  timestamps: true,
};