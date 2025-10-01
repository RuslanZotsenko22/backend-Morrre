// cms/src/collections/Cases.ts
import type { CollectionConfig } from 'payload';

export const Cases: CollectionConfig = {
  slug: 'cases',
  admin: { useAsTitle: 'title' },
  access: {
    read: () => true, // або тільки published
    create: ({ req }) => req.user?.collection === 'admins',
    update: ({ req }) => req.user?.collection === 'admins',
    delete: ({ req }) => req.user?.collection === 'admins',
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'description', type: 'richText' },
    { name: 'status', type: 'select', options: ['draft','published'], defaultValue: 'draft' },
    { name: 'industry', type: 'text' },
    { name: 'tags', type: 'array', fields: [{ name: 'value', type: 'text' }] },
    { name: 'categories', type: 'array', fields: [{ name: 'value', type: 'text' }] },
    {
      name: 'contributors',
      type: 'array',
      fields: [
        { name: 'userId', type: 'relationship', relationTo: 'users' },
        { name: 'role', type: 'text' },
      ],
    },
    {
      name: 'cover',
      type: 'group',
      fields: [
        { name: 'url', type: 'text' },
        {
          name: 'sizes',
          type: 'group',
          fields: [
            { name: 'low', type: 'text' },
            { name: 'medium', type: 'text' },
            { name: 'high', type: 'text' },
          ],
        },
      ],
    },
    {
      name: 'videos',
      type: 'array',
      fields: [
        { name: 'provider', type: 'text', defaultValue: 'vimeo' },
        { name: 'externalId', type: 'text' }, // vimeo video id
        { name: 'status', type: 'select', options: ['queued','processing','ready','failed'], defaultValue: 'ready' },
        { name: 'url', type: 'text' },
      ],
    },
    { name: 'ownerId', type: 'relationship', relationTo: 'users', required: true },
  ],

  hooks: {
    afterChange: [
      async ({ doc, operation }) => {
        // тригеримо Nest після create/update
        if (operation !== 'delete' && process.env.NEST_API_URL && process.env.INTERNAL_SECRET) {
          try {
            await fetch(`${process.env.NEST_API_URL}/api/internal/cases/sync`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Internal-Secret': process.env.INTERNAL_SECRET,
              },
              body: JSON.stringify({ id: doc.id }),
            });
          } catch (e) {
            console.error('SYNC hook error:', (e as Error).message);
          }
        }
      },
    ],
  },
};
