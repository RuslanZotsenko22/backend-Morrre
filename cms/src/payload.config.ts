// cms/src/payload.config.ts
import path from 'path'
import { buildConfig } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import nodemailer from 'nodemailer'

// ---- Mongo URL / Secret
const mongoURL = process.env.MONGODB_URI || process.env.DATABASE_URI || process.env.MONGO_URI
if (!mongoURL) throw new Error('Missing MONGODB_URI / DATABASE_URI / MONGO_URI')
if (!process.env.PAYLOAD_SECRET) throw new Error('Missing PAYLOAD_SECRET')

// ---- helper: масив об’єктів { value }
function toArrayOfValueObjects(input: unknown, limit = 50): Array<{ value: string }> {
  const out: Array<{ value: string }> = []
  const push = (s: string) => {
    const t = s.trim()
    if (t && !out.some(x => x.value === t)) out.push({ value: t })
  }

  if (typeof input === 'string') {
    push(input)
  } else if (Array.isArray(input)) {
    for (const v of input) {
      if (typeof v === 'string') push(v)
      else if (v && typeof v === 'object' && typeof (v as any).value === 'string') push((v as any).value)
      if (out.length >= limit) break
    }
  } else if (input && typeof input === 'object' && typeof (input as any).value === 'string') {
    push((input as any).value)
  }
  return out
}

// ---- Email adapter (працює і в dev, і коли очікують фабрику)
const transport = nodemailer.createTransport({
  streamTransport: true,
  buffer: true,
  newline: 'unix',
})

const emailAdapter: any = {
  name: 'local-nodemailer',
  defaultFromAddress: 'noreply@local.test',
  defaultFromName: 'Payload Local',
  async sendEmail(message: any) {
    await transport.sendMail({
      from: `"Payload Local" <noreply@local.test>`,
      ...message,
    })
  },
}

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET!,
  serverURL: process.env.PAYLOAD_PUBLIC_URL || 'http://localhost:3001',

  db: mongooseAdapter({ url: mongoURL }),
  editor: lexicalEditor({}),
  // @ts-ignore
  email: () => emailAdapter,

  collections: [
    // -------- ADMINS
    {
      slug: 'admins',
      auth: { cookies: true },
      admin: { useAsTitle: 'email' },
      access: {
        read: ({ req }) => !!req.user,
        create: ({ req }) => !!req.user,
        update: ({ req }) => !!req.user,
        delete: ({ req }) => !!req.user,
      },
      fields: [{ name: 'role', type: 'select', options: ['admin'], defaultValue: 'admin' }],
    },

    // -------- USERS
    {
      slug: 'users',
      admin: { useAsTitle: 'email' },
      access: {
        read: () => true,
        create: ({ req }) => req.user?.collection === 'admins',
        update: ({ req }) => req.user?.collection === 'admins',
        delete: ({ req }) => req.user?.collection === 'admins',
      },
      fields: [
        { name: 'email', type: 'email', required: true, unique: true, admin: { readOnly: true } },
        { name: 'name', type: 'text' },
        { name: 'avatar', type: 'text' },
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
        { name: 'passwordHash', type: 'text', admin: { readOnly: true } },
        { name: 'roles', type: 'array', fields: [{ name: 'value', type: 'text' }], admin: { readOnly: true } },
      ],
    },

    // -------- CASES
    {
      slug: 'cases',
      admin: { useAsTitle: 'title' },
      access: {
        read: () => true,
        create: ({ req }) => req.user?.collection === 'admins',
        update: ({ req }) => req.user?.collection === 'admins',
        delete: ({ req }) => req.user?.collection === 'admins',
      },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'description', type: 'richText' },
        { name: 'status', type: 'select', options: ['draft', 'published'], defaultValue: 'draft' },
        { name: 'industry', type: 'text' },

        // ✅ масив об’єктів { value }, НЕ масив рядків
        { name: 'tags', type: 'array', fields: [{ name: 'value', type: 'text', required: true }] },
        { name: 'categories', type: 'array', fields: [{ name: 'value', type: 'text', required: true }] },

        {
          name: 'contributors',
          type: 'array',
          // ⬇️ Перехоплюємо випадок, коли елемент масиву — просто рядок
          hooks: {
            beforeRead: [
              ({ value }) => {
                if (!Array.isArray(value)) return value
                return value.map((row) => {
                  if (typeof row === 'string') {
                    const id = row.trim()
                    return /^[0-9a-fA-F]{24}$/.test(id)
                      ? { userId: { id, collection: 'users' }, role: '' }
                      : { role: String(row) }
                  }
                  return row
                })
              },
            ],
          },
          fields: [
            {
              name: 'userId',
              type: 'relationship',
              relationTo: 'users',
              // ⬇️ Якщо в БД рядок — зробимо { id, collection }
              hooks: {
                beforeRead: [
                  ({ value }) => {
                    if (typeof value === 'string') {
                      const id = value.trim()
                      return /^[0-9a-fA-F]{24}$/.test(id)
                        ? { id, collection: 'users' }
                        : undefined
                    }
                    return value
                  },
                ],
              },
            },
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
            { name: 'externalId', type: 'text' },
            {
              name: 'status',
              type: 'select',
              defaultValue: 'ready',
              options: ['queued', 'uploading', 'processing', 'ready', 'failed', 'error'],
            },
            { name: 'url', type: 'text' },
            { name: 'originalName', type: 'text', admin: { condition: () => false } },
            { name: 'size', type: 'number', admin: { condition: () => false } },
            { name: 'mimetype', type: 'text', admin: { condition: () => false } },
          ],
        },

        {
          name: 'ownerId',
          type: 'relationship',
          relationTo: 'users',
          required: true,
          hooks: {
            beforeRead: [
              ({ value }) => {
                if (typeof value === 'string') {
                  const id = value.trim()
                  return /^[0-9a-fA-F]{24}$/.test(id)
                    ? { id, collection: 'users' }
                    : undefined
                }
                return value
              },
            ],
          },
        },

        { name: 'featuredSlides', type: 'checkbox', label: 'Show in “Popular today” slides', defaultValue: false },
        { name: 'popularQueued', type: 'checkbox', label: 'Queued for Popular', defaultValue: false },
        { name: 'forceToday', type: 'checkbox', label: 'Force next batch (Popular)', defaultValue: false },

        {
          name: 'queuedAt',
          type: 'date',
          label: 'Queued at',
          admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'popularActive',
          type: 'checkbox',
          label: 'Active in Popular',
          defaultValue: false,
          admin: { readOnly: true },
        },
        {
          name: 'popularBatchDate',
          type: 'date',
          label: 'Popular batch date (UTC 00:00)',
          admin: { readOnly: true, date: { pickerAppearance: 'dayOnly' } },
        },
        {
          name: 'popularPublishedAt',
          type: 'date',
          label: 'Popular published at',
          admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
        },
        { name: 'lifeScore', type: 'number', label: 'Life score', defaultValue: 100, admin: { readOnly: true } },
      ],

      hooks: {
        beforeRead: [
          async ({ doc }) => {
            if (!doc) return doc
            try {
              // ✅ узгоджуємо форму tags/categories до [{ value }]
              if (doc.tags !== undefined) (doc as any).tags = toArrayOfValueObjects(doc.tags, 50)
              if (doc.categories !== undefined) (doc as any).categories = toArrayOfValueObjects(doc.categories, 50)

              if (Array.isArray((doc as any).videos)) {
                ;(doc as any).videos = (doc as any).videos.map((v: any) => {
                  if (!v || typeof v !== 'object') return v
                  if (v.externalId != null && typeof v.externalId !== 'string') v.externalId = String(v.externalId)
                  if (v.url != null && typeof v.url !== 'string') v.url = String(v.url)
                  if (v.status === 'uploading') v.status = 'processing'
                  else if (v.status != null && typeof v.status !== 'string') v.status = String(v.status)
                  return v
                })
              }
            } catch { /* ignore */ }
            return doc
          },
        ],

        beforeValidate: [
          ({ data }) => {
            const sizes = data?.cover?.sizes
            const pickUrl = (v: any) => (v && typeof v === 'object' && 'url' in v ? String(v.url ?? '') : v)

            // ✅ tags/categories -> [{ value }]
            if ((data as any)?.tags !== undefined) (data as any).tags = toArrayOfValueObjects((data as any).tags, 50)
            if ((data as any)?.categories !== undefined) (data as any).categories = toArrayOfValueObjects((data as any).categories, 50)

            if (sizes) {
              if (sizes.low !== undefined) sizes.low = pickUrl(sizes.low)
              if (sizes.medium !== undefined) sizes.medium = pickUrl(sizes.medium)
              if (sizes.high !== undefined) sizes.high = pickUrl(sizes.high)
              if (typeof sizes.low === 'number') sizes.low = String(sizes.low)
              if (typeof sizes.medium === 'number') sizes.medium = String(sizes.medium)
              if (typeof sizes.high === 'number') sizes.high = String(sizes.high)
            }
            if (Array.isArray((data as any)?.videos)) {
              ;(data as any).videos = (data as any).videos.map((v: any) =>
                v?.status === 'uploading' ? { ...v, status: 'processing' } : v,
              )
            }
            return data
          },
        ],

        afterChange: [
          async ({ doc, operation }) => {
            if (operation === 'delete') return
            try {
              if (process.env.NEST_API_URL && process.env.INTERNAL_SECRET) {
                await fetch(`${process.env.NEST_API_URL}/internal/cases/sync`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Internal-Secret': process.env.INTERNAL_SECRET as string,
                  },
                  body: JSON.stringify({ id: String((doc as any).id || (doc as any)._id) }),
                })
              }
            } catch { /* ignore */ }
          },
        ],
      },
    },

    // -------- COLLECTIONS (нова)
    {
      slug: 'collections',
      admin: { useAsTitle: 'title' },
      access: {
        read: () => true,
        create: ({ req }) => req.user?.collection === 'admins',
        update: ({ req }) => req.user?.collection === 'admins',
        delete: ({ req }) => req.user?.collection === 'admins',
      },
      fields: [
        { name: 'title', type: 'text', required: true },
        {
          name: 'slug',
          type: 'text',
          required: true,
          unique: true,
          admin: { description: 'URL-ідентифікатор (напр., "top-branding")' },
        },
        { name: 'description', type: 'textarea' },
        {
          name: 'cover',
          type: 'group',
          fields: [
            { name: 'type', type: 'select', options: ['image', 'video'], defaultValue: 'image', required: true },
            { name: 'url', type: 'text', required: true },
            { name: 'alt', type: 'text' },
          ],
        },
        {
          name: 'cases',
          type: 'relationship',
          relationTo: 'cases',
          hasMany: true,
          admin: { description: 'Порядок тут = порядок у колекції' },
          // ⬇️ якщо випадково лежать рядки
          hooks: {
            beforeRead: [
              ({ value }) => {
                if (!value) return value
                const arr = Array.isArray(value) ? value : [value]
                return arr
                  .map((v) => {
                    if (typeof v === 'string') {
                      const id = v.trim()
                      return /^[0-9a-fA-F]{24}$/.test(id) ? { id, collection: 'cases' } : undefined
                    }
                    return v
                  })
                  .filter(Boolean)
              },
            ],
          },
        },
        { name: 'featured', type: 'checkbox', defaultValue: false, label: 'Показувати на головній' },
        { name: 'order', type: 'number', defaultValue: 0 },
      ],
      hooks: {
        afterChange: [
          async ({ doc }) => {
            try {
              if (process.env.NEST_API_URL && process.env.INTERNAL_SECRET) {
                await fetch(`${process.env.NEST_API_URL}/api/internal/collections/set-cases`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Internal-Secret': process.env.INTERNAL_SECRET as string,
                  },
                  body: JSON.stringify({
                    id: String((doc as any).id || (doc as any)._id),
                    cases: (Array.isArray((doc as any).cases) ? (doc as any).cases : []).map(String),
                  }),
                })
              }
            } catch (e) {
              console.error('[collections.afterChange] sync failed', e)
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
