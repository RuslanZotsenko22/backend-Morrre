// cms/src/collections/Admins.ts
import { CollectionConfig } from 'payload';

export const Admins: CollectionConfig = {
  slug: 'admins',
   auth: true,
  admin: { useAsTitle: 'email' },
  access: {
    read: ({ req }) => !!req.user,       // бачать лише залогінені адміни
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => !!req.user,
  },
  fields: [
    { name: 'role', type: 'select', options: ['admin'], defaultValue: 'admin' },
  ],
};
