import { CollectionConfig } from 'payload'

// Перетворює довільне значення у масив об’єктів { value: string }
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

export const Cases: CollectionConfig = {
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

    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      options: [
        { label: 'draft', value: 'draft' },
        { label: 'published', value: 'published' },
      ],
    },

    { name: 'industry', type: 'text' },

    // ✅ Масив об'єктів { value }
    {
      name: 'tags',
      type: 'array',
      fields: [{ name: 'value', type: 'text', required: true }],
    },
    {
      name: 'categories',
      type: 'array',
      fields: [{ name: 'value', type: 'text', required: true }],
    },

    {
      name: 'contributors',
      type: 'array',
      // Перехопимо випадок коли елемент масиву — рядок (наприклад "postman" або ObjectId рядком)
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
          // Гарантуємо, що рядок перетвориться у { id, collection }
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
        // приймає { low: {url}, medium: {url}, high: {url} } або просто рядки
        { name: 'sizes', type: 'json' },
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
          defaultValue: 'queued',
          options: [
            { label: 'queued', value: 'queued' },
            { label: 'uploading', value: 'uploading' },
            { label: 'processing', value: 'processing' },
            { label: 'ready', value: 'ready' },
            { label: 'error', value: 'error' },
          ],
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
      // Поле-рівень захисту: якщо у БД лежить рядок
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
  ],

  hooks: {
    beforeRead: [
      async ({ doc }) => {
        if (!doc) return doc

        // ✅ Узгоджуємо форму tags/categories до [{ value }]
        if ((doc as any).tags !== undefined) {
          ;(doc as any).tags = toArrayOfValueObjects((doc as any).tags, 50)
        }
        if ((doc as any).categories !== undefined) {
          ;(doc as any).categories = toArrayOfValueObjects((doc as any).categories, 50)
        }

        // ✅ Відео: м’яка нормалізація типів
        if (Array.isArray((doc as any).videos)) {
          ;(doc as any).videos = (doc as any).videos.map((v: any) => {
            if (!v || typeof v !== 'object') return v
            if (v.externalId != null && typeof v.externalId !== 'string') v.externalId = String(v.externalId)
            if (v.url != null && typeof v.url !== 'string') v.url = String(v.url)
            if (v.status != null && typeof v.status !== 'string') v.status = String(v.status)
            return v
          })
        }

        return doc
      },
    ],

    beforeValidate: [
      ({ data }) => {
        if (!data) return data

        // ✅ Приводимо tags/categories до схеми масиву об’єктів
        if ((data as any).tags !== undefined) {
          ;(data as any).tags = toArrayOfValueObjects((data as any).tags, 50)
        }
        if ((data as any).categories !== undefined) {
          ;(data as any).categories = toArrayOfValueObjects((data as any).categories, 50)
        }

        // ✅ cover.sizes: витягуємо url з можливих об’єктів
        const sizes = (data as any)?.cover?.sizes as any
        const pickUrl = (v: any) => (v && typeof v === 'object' && 'url' in v ? String(v.url ?? '') : v)
        if (sizes && typeof sizes === 'object') {
          const norm: Record<string, string> = {}
          if (sizes.low !== undefined) norm.low = String(pickUrl(sizes.low) ?? '')
          if (sizes.medium !== undefined) norm.medium = String(pickUrl(sizes.medium) ?? '')
          if (sizes.high !== undefined) norm.high = String(pickUrl(sizes.high) ?? '')
          ;(data as any).cover = (data as any).cover ?? {}
          const existingSizes = (data as any).cover.sizes || {}
          ;(data as any).cover.sizes = { ...existingSizes, ...norm }
        }

        // ✅ Відео: "uploading" → "processing"
        if (Array.isArray((data as any).videos)) {
          ;(data as any).videos = (data as any).videos.map((v: any) =>
            v?.status === 'uploading' ? { ...v, status: 'processing' } : v,
          )
        }

        // ✅ На створенні/оновленні ownerId/contributors можуть прийти рядками — не валідатор, але пом’якшуємо
        if (typeof (data as any).ownerId === 'string') {
          const id = (data as any).ownerId.trim()
          ;(data as any).ownerId = /^[0-9a-fA-F]{24}$/.test(id) ? { id, collection: 'users' } : undefined
        }
        if (Array.isArray((data as any).contributors)) {
          ;(data as any).contributors = (data as any).contributors.map((row: any) => {
            if (typeof row === 'string') {
              const id = row.trim()
              return /^[0-9a-fA-F]{24}$/.test(id)
                ? { userId: { id, collection: 'users' }, role: '' }
                : { role: String(row) }
            }
            if (row && typeof row === 'object' && typeof row.userId === 'string') {
              const id = row.userId.trim()
              row.userId = /^[0-9a-fA-F]{24}$/.test(id) ? { id, collection: 'users' } : undefined
            }
            return row
          })
        }

        return data
      },
    ],

    // Сигнали у Nest після змін (не блокують адмінку)
    afterChange: [
      async ({ doc /*, operation */ }) => {
        try {
          // основний синх кейсу
          const sync = fetch(`${process.env.NEST_API_URL}/api/internal/cases/sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
            },
            body: JSON.stringify({ id: String((doc as any).id || (doc as any)._id) }),
          })

          // інвалідація кешу головної
          const invalidateHome = fetch(`${process.env.NEST_API_URL}/api/internal/home/invalidate-landing`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
            },
          })

          await Promise.allSettled([sync, invalidateHome])
        } catch {
          // ignore
        }
      },
    ],

    // окремо очистимо кеш головної і після видалення кейсу
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
        } catch {
          // ignore
        }
      },
    ],
  },
}
