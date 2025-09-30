import path from 'path'
import { buildConfig } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { mongooseAdapter } from '@payloadcms/db-mongodb'

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET!,
  serverURL: process.env.PAYLOAD_PUBLIC_URL,

  // ✅ правильно: adapter напряму
  db: mongooseAdapter({
    url: process.env.MONGODB_URI!,   // у .env саме MONGODB_URI
  }),

  editor: lexicalEditor({}),
  collections: [
    {
      slug: 'users',
      auth: true,
      admin: { useAsTitle: 'email' },
      fields: [{ name: 'role', type: 'text' }],
    },
    {
      slug: 'cases',
      admin: { useAsTitle: 'title' },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'ownerId', type: 'text' },
      ],
    },
  ],
  typescript: {
    outputFile: path.resolve(__dirname, 'payload-types.ts'),
  },
})
