import { CollectionConfig } from 'payload/types';

export const Curators: CollectionConfig = {
  slug: 'curators',
  admin: {
    useAsTitle: 'user',
    group: 'Botnet',
    defaultColumns: ['user', 'weight', 'specializations', 'isActive'],
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      unique: true,
    },
    {
      name: 'weight',
      type: 'number',
      defaultValue: 1.0,
      min: 0.1,
      max: 3.0,
      admin: {
        step: 0.1,
      },
    },
    {
      name: 'specializations',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Дизайн', value: 'design' },
        { label: 'Код', value: 'code' },
        { label: 'Анімація', value: 'animation' },
        { label: '3D', value: '3d' },
        { label: 'UX/UI', value: 'uxui' },
        { label: 'Копірайтинг', value: 'copywriting' },
        { label: 'Брендинг', value: 'branding' },
      ],
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      label: 'Активний куратор',
    },
    {
      name: 'ratedCases',
      type: 'array',
      fields: [
        {
          name: 'case',
          type: 'relationship',
          relationTo: 'cases',
        },
        {
          name: 'rating',
          type: 'select',
          options: [
            { label: 'Відмінно', value: 'excellent' },
            { label: 'Добре', value: 'good' },
            { label: 'Нормально', value: 'neutral' },
            { label: 'Погано', value: 'bad' },
            { label: 'Дуже погано', value: 'very_bad' },
          ],
        },
        {
          name: 'ratedAt',
          type: 'date',
        },
      ],
    },
    {
      name: 'stats',
      type: 'group',
      fields: [
        {
          name: 'totalRatings',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'accuracyScore',
          type: 'number',
          defaultValue: 1.0,
          min: 0,
          max: 1,
        },
        {
          name: 'lastActive',
          type: 'date',
        },
      ],
    },
  ],
};