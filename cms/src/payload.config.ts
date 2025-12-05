import path from 'path'
import { buildConfig } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import nodemailer from 'nodemailer'

import PopularQueue from './collections/PopularQueue'
import { Media } from './collections/Media'
import { Bots } from './collections/Bots'
import { BotnetQueue } from './collections/BotnetQueue'
import { BotnetSettings } from './collections/BotnetSettings'
import { BotAvatars } from './collections/BotAvatars'

// ---- Mongo URL / Secret
const mongoURL = process.env.MONGODB_URI || process.env.DATABASE_URI || process.env.MONGO_URI
if (!mongoURL) throw new Error('Missing MONGODB_URI / DATABASE_URI / MONGO_URI')
if (!process.env.PAYLOAD_SECRET) throw new Error('Missing PAYLOAD_SECRET')

// ---- helper: масив об'єктів { value }
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

// ---- Email adapter
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

  //  BOTNET in admin 
  admin: {
    groups: [
      {
        label: 'Botnet',
        items: ['bots', 'botnet-queue', 'botnet-settings', 'bot-avatars'],
      },
    ],
  },

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
      admin: { useAsTitle: 'email', defaultColumns: ['email', 'name', 'rating'] },
      access: {
        read: () => true,
        create: ({ req }) => req.user?.collection === 'admins',
        update: ({ req }) => req.user?.collection === 'admins',
        delete: ({ req }) => req.user?.collection === 'admins',
      },
      hooks: {
        afterRead: [
          async ({ doc }) => {
            try {
              const mongoose = (await import('mongoose')).default;
              const idStr = String((doc as any)?.id || (doc as any)?._id || '');
              if (!idStr || !/^[0-9a-fA-F]{24}$/.test(idStr)) return doc;

              const stats = await mongoose.connection
                .collection('user_stats')
                .findOne({ userId: new mongoose.Types.ObjectId(idStr) });

              (doc as any).rating = stats?.totalScore ?? 0;
              (doc as any).weeklyScore = stats?.weeklyScore ?? 0;
            } catch {
              // ignore
            }
            return doc;
          },
        ],
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
        {
          name: 'rating',
          type: 'number',
          label: 'Rating',
          admin: { readOnly: true, position: 'sidebar' },
        },
        {
          name: 'weeklyScore',
          type: 'number',
          label: 'Weekly score',
          admin: { readOnly: true, position: 'sidebar' },
        },
        
        //  for botnet
        {
          name: 'isBot',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            hidden: true,
            description: 'Позначає, чи є цей обліковий запис ботом',
          },
        },
        {
          name: 'canVote',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: 'Чи може цей користувач/бот голосувати за кейси',
            condition: (data) => data?.isBot,
          },
        },
        {
          name: 'lastBotActivity',
          type: 'date',
          admin: {
            description: 'Остання активність бота',
            readOnly: true,
            condition: (data) => data?.isBot,
          },
        },
        {
          name: 'botActivityCount',
          type: 'number',
          defaultValue: 0,
          admin: {
            description: 'Кількість виконаних активностей',
            readOnly: true,
            condition: (data) => data?.isBot,
          },
        },
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
        { name: 'description', type: 'textarea' },
        { name: 'status', type: 'select', options: ['draft', 'published'], defaultValue: 'draft' },
        { name: 'industry', type: 'text' },
        { name: 'tags', type: 'array', fields: [{ name: 'value', type: 'text', required: true }] },
        { name: 'categories', type: 'array', fields: [{ name: 'value', type: 'text', required: true }] },

        {
          name: 'contributors',
          type: 'array',
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
          defaultValue: { url: '', sizes: { low: '', medium: '', high: '' } },
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

        // ---------- Popular meta 
        {
          type: 'tabs',
          tabs: [
            {
              label: 'Popular meta',
              fields: [
                { name: 'featuredSlides', type: 'checkbox', label: 'Show in "Popular today" slides', defaultValue: false },
                {
                  name: 'popularQueued',
                  type: 'checkbox',
                  label: 'Queued for Popular (system)',
                  defaultValue: false,
                  admin: {
                    readOnly: true,
                    description: 'Службове поле: виставляється автоматично при додаванні в чергу.',
                  },
                },
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
                {
                  name: 'popularStatus',
                  type: 'select',
                  label: 'Popular status',
                  options: [
                    { label: 'None', value: 'none' },
                    { label: 'Queued (in queue)', value: 'queued' },
                    { label: 'Published (on Popular)', value: 'published' },
                  ],
                  defaultValue: 'none',
                  admin: {
                    readOnly: true,
                    description: 'Реальний статус у розділі Popular (оновлюється бекендом).',
                  },
                },
                {
                  name: 'lifeScore',
                  type: 'number',
                  label: 'Life score',
                  defaultValue: 100,
                  admin: { readOnly: true },
                },
              ],
            },
          ],
        },
      ],
      hooks: {
        beforeRead: [
          async ({ doc }) => {
            if (!doc) return doc
            try {
              if (doc.tags !== undefined) (doc as any).tags = toArrayOfValueObjects(doc.tags, 50)

              if (doc.categories !== undefined) (doc as any).categories = toArrayOfValueObjects(doc.categories, 50)
                if ((doc as any).cover == null || typeof (doc as any).cover !== 'object') {
          (doc as any).cover = { url: '', sizes: { low: '', medium: '', high: '' } }
        } else {
          if ((doc as any).cover.sizes == null || typeof (doc as any).cover.sizes !== 'object') {
            (doc as any).cover.sizes = { low: '', medium: '', high: '' }
          } else {
            const sz = (doc as any).cover.sizes
            if (sz.low == null) sz.low = ''
            if (sz.medium == null) sz.medium = ''
            if (sz.high == null) sz.high = ''
          }
          if ((doc as any).cover.url == null) (doc as any).cover.url = ''
        }
            } catch { /* ignore */ }
            return doc
          },
        ],
      },
    },

    // -------- COLLECTIONS 
    {
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
        },
        { name: 'featured', type: 'checkbox', defaultValue: false, label: 'Показувати на головній' },
        { name: 'order', type: 'number', defaultValue: 0 },
      ],
      
      hooks: {
        afterChange: [
          async () => {
            try {
              await fetch(`${process.env.NEST_API_URL}/api/internal/home/invalidate-landing`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
                },
              })
            } catch {/* ignore */}
          },
        ],
        afterDelete: [
          async () => {
            try {
              await fetch(`${process.env.NEST_API_URL}/api/internal/home/invalidate-landing`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
                },
              })
            } catch {/* ignore */}
          },
        ],
      },
    },

    PopularQueue,

    // БОТНЕТ КОЛЕКЦІЇ
    Media,
    Bots,
    BotnetQueue, 
    BotnetSettings,
    BotAvatars,
  ],

  typescript: {
    outputFile: path.resolve(__dirname, 'payload-types.ts'),
  },
})