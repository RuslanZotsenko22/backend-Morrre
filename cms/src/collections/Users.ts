// cms/src/collections/Users.ts
import { CollectionConfig } from 'payload';

export const Users: CollectionConfig = {
  slug: 'users', // та сама колекція, що у Nest
  admin: { useAsTitle: 'name' },
  access: {
    read: () => true,
    create: ({ req }) => req.user?.collection === 'admins',   // лише адміни
    update: ({ req }) => req.user?.collection === 'admins',
    delete: ({ req }) => req.user?.collection === 'admins',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'avatar', type: 'text' },               // з Cloudinary зберігай URL
    { name: 'about', type: 'textarea' },
    { name: 'location', type: 'text' },
    { name: 'socials', type: 'array', fields: [
        { name: 'type', type: 'text' },
        { name: 'url', type: 'text' },
      ]
    },
    // чутливі поля лише readOnly у UI (Nest ними керує)
    { name: 'email', type: 'email', admin: { readOnly: true } },
    { name: 'passwordHash', type: 'text', admin: { readOnly: true } },
    { name: 'roles', type: 'array', fields: [{ name: 'value', type: 'text' }], admin: { readOnly: true } },
  ],
};
