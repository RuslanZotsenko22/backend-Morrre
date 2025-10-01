// cms/src/payload.config.ts
import path from 'path'
import { buildConfig } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { mongooseAdapter } from '@payloadcms/db-mongodb'

const mongoURL = process.env.MONGODB_URI || process.env.DATABASE_URI
if (!mongoURL) throw new Error('Missing MONGODB_URI / DATABASE_URI')
if (!process.env.PAYLOAD_SECRET) throw new Error('Missing PAYLOAD_SECRET')

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET!,
  serverURL: process.env.PAYLOAD_PUBLIC_URL || 'http://localhost:3001',

  db: mongooseAdapter({ url: mongoURL }),

  editor: lexicalEditor({}),

  collections: [
    // 1) Адміни Payload (вхід у /admin)
    {
      slug: 'admins',
      auth: { cookies: true },
      admin: { useAsTitle: 'email' },
      access: {
        read: ({ req }) => !!req.user, // бачать лише залогінені адміни
        create: ({ req }) => !!req.user,
        update: ({ req }) => !!req.user,
        delete: ({ req }) => !!req.user,
      },
      fields: [
        { name: 'role', type: 'select', options: ['admin'], defaultValue: 'admin' },
      ],
    },

    // 2) Користувачі прод-системи (редагуємо через UI, але auth керує Nest)
    {
      slug: 'users',
      // ВАЖЛИВО: НЕ вмикаємо auth тут, щоб не конфліктувати з Nest
      admin: { useAsTitle: 'email' },
      access: {
        read: () => true, // або обмежити за потреби
        create: ({ req }) => req.user?.collection === 'admins',
        update: ({ req }) => req.user?.collection === 'admins',
        delete: ({ req }) => req.user?.collection === 'admins',
      },
      fields: [
        { name: 'email', type: 'email', required: true, unique: true, admin: { readOnly: true } },
        { name: 'name', type: 'text' },
        { name: 'avatar', type: 'text' },       // зберігай Cloudinary URL
        { name: 'about', type: 'textarea' },
        { name: 'location', type: 'text' },
        {
          name: 'socials',
          type: 'array',
          fields: [
            { name: 'type', type: 'text' },
            { name: 'url', type: 'text' },
          ],
        },
        // поля, якими керує Nest — тільки для перегляду
        { name: 'passwordHash', type: 'text', admin: { readOnly: true } },
        { name: 'roles', type: 'array', fields: [{ name: 'value', type: 'text' }], admin: { readOnly: true } },
      ],
    },

    // 3) Кейси
    {
      slug: 'cases',
      admin: { useAsTitle: 'title' },
      access: {
        read: () => true, // або лише published
        create: ({ req }) => req.user?.collection === 'admins',
        update: ({ req }) => req.user?.collection === 'admins',
        delete: ({ req }) => req.user?.collection === 'admins',
      },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'description', type: 'richText' },
        { name: 'status', type: 'select', options: ['draft', 'published'], defaultValue: 'draft' },
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
            { name: 'externalId', type: 'text' },     // vimeo video id
            { name: 'status', type: 'select', options: ['queued','processing','ready','failed'], defaultValue: 'ready' },
            { name: 'url', type: 'text' },
          ],
        },
        { name: 'ownerId', type: 'relationship', relationTo: 'users', required: true },
      ],
      // Опційно: повідомляємо Nest про зміни
      hooks: {
        afterChange: [
          async ({ doc, operation }) => {
            if (operation !== 'delete' && process.env.NEST_API_URL && process.env.INTERNAL_SECRET) {
              try {
                await fetch(`${process.env.NEST_API_URL}/internal/cases/sync`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Internal-Secret': process.env.INTERNAL_SECRET,
                  },
                  body: JSON.stringify({ id: doc.id }),
                })
              } catch { /* ignore */ }
            }
          },
        ],
      },
    },
  ],

  typescript: {
    outputFile: path.resolve(__dirname, 'payload-types.ts'),
  },
})
