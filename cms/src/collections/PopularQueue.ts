import type { CollectionConfig } from 'payload/types';

const PopularQueue: CollectionConfig = {
  slug: 'popularQueue',
  labels: { singular: 'Popular Queue Item', plural: 'Popular Queue' },
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['case', 'status', 'forceToday', 'addedAt', 'publishedAt'],
    description: 'Керована модератором черга кейсів для розділу Popular (FIFO + Force Today).',
  },
  access: {
    read: ({ req }) => !!req.user, // бачать тільки залогінені (можеш звузити до адмінів)
    create: ({ req }) => req.user?.collection === 'admins',
    update: ({ req }) => req.user?.collection === 'admins',
    delete: ({ req }) => req.user?.collection === 'admins',
  },
  fields: [
    {
      name: 'case',
      type: 'relationship',
      relationTo: 'cases',
      required: true,
      maxDepth: 1,
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'queued',
      options: [
        { label: 'Queued', value: 'queued' },
        { label: 'Published', value: 'published' },
      ],
      admin: { width: '50%' },
    },
    {
      name: 'forceToday',
      type: 'checkbox',
      defaultValue: false,
      admin: { width: '50%' },
    },
    { name: 'addedAt', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'publishedAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
  ],
  hooks: {
    beforeChange: [
      async ({ data, operation }) => {
        if (operation === 'create' && !data.addedAt) {
          data.addedAt = new Date().toISOString();
        }
        return data;
      },
    ],
    // (опціонально) якщо хочеш синхронізувати статус відразу в Nest:
    // afterChange: [
    //   async ({ doc, req }) => {
    //     try {
    //       if (process.env.NEST_API_URL && process.env.INTERNAL_SECRET) {
    //         await fetch(`${process.env.NEST_API_URL}/internal/popular-queue/sync`, {
    //           method: 'POST',
    //           headers: {
    //             'Content-Type': 'application/json',
    //             'X-Internal-Secret': process.env.INTERNAL_SECRET as string,
    //           },
    //           body: JSON.stringify({ id: String(doc.id), status: doc.status, forceToday: !!doc.forceToday }),
    //         });
    //       }
    //     } catch {/* ignore */}
    //   },
    // ],
  },
};

export default PopularQueue;
