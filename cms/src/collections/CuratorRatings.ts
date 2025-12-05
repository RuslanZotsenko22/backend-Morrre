import { CollectionConfig } from 'payload/types';

export const CuratorRatings: CollectionConfig = {
  slug: 'curator-ratings',
  admin: {
    useAsTitle: 'case',
    group: 'Botnet',
    defaultColumns: ['case', 'curator', 'rating', 'createdAt'],
  },
  timestamps: true,
  fields: [
    {
      name: 'case',
      type: 'relationship',
      relationTo: 'cases',
      required: true,
      index: true,
    },
    {
      name: 'curator',
      type: 'relationship',
      relationTo: 'curators',
      required: true,
      index: true,
    },
    {
      name: 'rating',
      type: 'select',
      required: true,
      options: [
        { label: 'Відмінно', value: 'excellent' },
        { label: 'Добре', value: 'good' },
        { label: 'Нормально', value: 'neutral' },
        { label: 'Погано', value: 'bad' },
        { label: 'Дуже погано', value: 'very_bad' },
      ],
    },
    {
      name: 'comment',
      type: 'textarea',
      label: 'Коментар куратора',
    },
    {
      name: 'aspects',
      type: 'group',
      fields: [
        {
          name: 'design',
          type: 'select',
          options: [
            { label: 'Відмінний', value: 'excellent' },
            { label: 'Добрий', value: 'good' },
            { label: 'Середній', value: 'neutral' },
            { label: 'Слабкий', value: 'bad' },
            { label: 'Поганий', value: 'very_bad' },
          ],
        },
        {
          name: 'creativity',
          type: 'select',
          options: [
            { label: 'Висока', value: 'excellent' },
            { label: 'Добра', value: 'good' },
            { label: 'Середня', value: 'neutral' },
            { label: 'Низька', value: 'bad' },
            { label: 'Відсутня', value: 'very_bad' },
          ],
        },
        {
          name: 'execution',
          type: 'select',
          options: [
            { label: 'Ідеальне', value: 'excellent' },
            { label: 'Якісне', value: 'good' },
            { label: 'Задовільне', value: 'neutral' },
            { label: 'Посереднє', value: 'bad' },
            { label: 'Погане', value: 'very_bad' },
          ],
        },
      ],
    },
    {
      name: 'confidence',
      type: 'number',
      defaultValue: 1,
      min: 0.1,
      max: 1,
      admin: {
        description: 'Впевненість куратора в оцінці',
      },
    },
    {
      name: 'influencedBoost',
      type: 'number',
      admin: {
        description: 'Вплив на буст (%)',
        readOnly: true,
      },
    },
  ],
};