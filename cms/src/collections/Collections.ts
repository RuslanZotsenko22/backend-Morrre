
import { CollectionConfig } from 'payload/types'

const Collections: CollectionConfig = {
  slug: 'collections',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'featured', 'order', 'createdAt'],
    description: 'Ручні добірки кейсів для /collections та головної (featured).',
  },
  access: {
    read: () => true,
    create: ({ req }) => req.user?.collection === 'admins',
    update: ({ req }) => req.user?.collection === 'admins',
    delete: ({ req }) => req.user?.collection === 'admins',
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'description', type: 'textarea' },
    { name: 'featured', type: 'checkbox', defaultValue: false },
    { name: 'order', type: 'number', defaultValue: 0 },

    {
      name: 'cover',
      type: 'group',
      fields: [
        { name: 'url', type: 'text' },         
        { name: 'type', type: 'select', options: [
          { label: 'Image', value: 'image' },
          { label: 'Video', value: 'video' },
        ], defaultValue: 'image' },
      ],
    },

    {
      name: 'cases',
      type: 'relationship',
      relationTo: 'cases',
      hasMany: true,
      maxDepth: 1,
    },
  ],
}

export default Collections
