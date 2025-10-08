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

const clamp = (n: any, min: number, max: number) => {
  const x = Number(n)
  if (!Number.isFinite(x)) return min
  return Math.max(min, Math.min(max, x))
}

// проста перевірка YouTube/Vimeo
function detectIframeProvider(url: string): 'youtube' | 'vimeo' | undefined {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube'
    if (host.includes('vimeo.com')) return 'vimeo'
    return undefined
  } catch {
    return undefined
  }
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

    // ⬇️ ЗАМІНА: industry як select (enum)
    {
      name: 'industry',
      type: 'select',
      required: false,
      hasMany: false,
      options: [
        { label: 'Fashion', value: 'fashion' },
        { label: 'Tech', value: 'tech' },
        { label: 'Health', value: 'health' },
        { label: 'Finance', value: 'finance' },
        { label: 'Education', value: 'education' },
        { label: 'Entertainment', value: 'entertainment' },
        { label: 'Food', value: 'food' },
        { label: 'Travel', value: 'travel' },
        { label: 'Automotive', value: 'automotive' },
        { label: 'Other', value: 'other' },
      ],
      admin: { description: 'Вибери одну індустрію' },
    },

    // ⬇️ НОВЕ: whatWasDone — масив чіпів зі списку
    {
      name: 'whatWasDone',
      label: 'Що було зроблено',
      type: 'array',
      labels: { singular: 'Item', plural: 'Items' },
      fields: [
        {
          name: 'value',
          type: 'select',
          required: true,
          options: [
            { label: 'Naming', value: 'naming' },
            { label: 'Logo Design', value: 'logo' },
            { label: 'Branding', value: 'branding' },
            { label: 'Art Direction', value: 'art-direction' },
            { label: 'UI/UX', value: 'ui-ux' },
            { label: '3D', value: '3d' },
            { label: 'Motion', value: 'motion' },
            { label: 'Typography', value: 'typography' },
            { label: 'Illustration', value: 'illustration' },
            { label: 'Copywriting', value: 'copywriting' },
            { label: 'Packaging', value: 'packaging' },
            { label: 'Web Dev', value: 'web' },
          ],
        },
      ],
      admin: { description: 'Оберіть кілька пунктів (опційно)' },
    },

    // ✅ масив об'єктів { value }
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

    // ---- Contributors
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

    // ---- Cover
    {
      name: 'cover',
      type: 'group',
      fields: [
        { name: 'url', type: 'text' },
        { name: 'sizes', type: 'json' }, // приймає { low|medium|high: string | {url} }
      ],
    },

    // ---- Videos
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

    // ---- Owner
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

    // ─────────────────────────────────────────────────────────
    // NEW: Блокова модель контенту
    {
      name: 'blocks',
      type: 'array',
      labels: { singular: 'Block', plural: 'Blocks' },
      admin: { description: 'Послідовність блоків контенту: text / iframe / media' },
      fields: [
        {
          name: 'kind',
          type: 'select',
          required: true,
          defaultValue: 'text',
          options: [
            { label: 'Text', value: 'text' },
            { label: 'iFrame (YouTube/Vimeo)', value: 'iframe' },
            { label: 'Media (images/videos)', value: 'media' },
          ],
        },

        // text
        {
          name: 'text',
          type: 'richText',
          admin: {
            condition: (_, siblingData) => siblingData?.kind === 'text',
            description: 'Rich text / Markdown (від рішень фронту)',
          },
        },

        // iframe
        {
          type: 'group',
          name: 'iframe',
          admin: {
            condition: (_, siblingData) => siblingData?.kind === 'iframe',
          },
          fields: [
            { name: 'url', type: 'text', required: true },
            {
              name: 'provider',
              type: 'select',
              required: true,
              options: [
                { label: 'YouTube', value: 'youtube' },
                { label: 'Vimeo', value: 'vimeo' },
              ],
            },
          ],
        },

        // media[]
        {
          type: 'array',
          name: 'media',
          admin: {
            condition: (_, siblingData) => siblingData?.kind === 'media',
            description: 'Список медіа-елементів (image/video)',
          },
          fields: [
            {
              name: 'type',
              type: 'select',
              required: true,
              options: [
                { label: 'Image', value: 'image' },
                { label: 'Video', value: 'video' },
              ],
            },
            { name: 'url', type: 'text', required: true },
            { name: 'alt', type: 'text' },
            { name: 'width', type: 'number' },
            { name: 'height', type: 'number' },
          ],
        },
      ],
    },

    // NEW: Стилі сторінки
    {
      name: 'style',
      type: 'group',
      admin: { description: 'Візуальні налаштування сторінки кейса' },
      fields: [
        {
          name: 'radius',
          type: 'number',
          defaultValue: 0,
          admin: { description: 'Border radius (0..100)' },
        },
        {
          name: 'gap',
          type: 'number',
          defaultValue: 24,
          admin: { description: 'Відступ між блоками, px (0..100)' },
        },
      ],
    },
  ],

  hooks: {
    // ── мʼяка нормалізація при читанні
    beforeRead: [
      async ({ doc }) => {
        if (!doc) return doc

        // Узгоджуємо форму tags/categories до [{ value }]
        if ((doc as any).tags !== undefined) {
          ;(doc as any).tags = toArrayOfValueObjects((doc as any).tags, 50)
        }
        if ((doc as any).categories !== undefined) {
          ;(doc as any).categories = toArrayOfValueObjects((doc as any).categories, 50)
        }

        // Відео: м’яка нормалізація типів
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

    // ── нормалізація перед валідацією/збереженням
    beforeValidate: [
      ({ data }) => {
        if (!data) return data

        // tags/categories → [{ value }]
        if ((data as any).tags !== undefined) {
          ;(data as any).tags = toArrayOfValueObjects((data as any).tags, 50)
        }
        if ((data as any).categories !== undefined) {
          ;(data as any).categories = toArrayOfValueObjects((data as any).categories, 50)
        }

        // cover.sizes: витягуємо url з можливих об’єктів
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

        // Відео: "uploading" → "processing"
        if (Array.isArray((data as any).videos)) {
          ;(data as any).videos = (data as any).videos.map((v: any) =>
            v?.status === 'uploading' ? { ...v, status: 'processing' } : v,
          )
        }

        // ownerId рядком → relationship-обʼєкт
        if (typeof (data as any).ownerId === 'string') {
          const id = (data as any).ownerId.trim()
          ;(data as any).ownerId = /^[0-9a-fA-F]{24}$/.test(id) ? { id, collection: 'users' } : undefined
        }

        // contributors рядками → нормалізуємо
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

        // ── NEW: нормалізація blocks
        if (Array.isArray((data as any).blocks)) {
          ;(data as any).blocks = (data as any).blocks
            .map((b: any) => {
              if (!b || typeof b !== 'object') return null
              const kind = b.kind
              if (kind === 'text') {
                // richText зберігаємо як є
                return { kind: 'text', text: b.text }
              }
              if (kind === 'iframe') {
                const url = typeof b?.iframe?.url === 'string' ? b.iframe.url.trim() : ''
                const provider = (typeof b?.iframe?.provider === 'string'
                  ? b.iframe.provider
                  : detectIframeProvider(url)) as 'youtube' | 'vimeo' | undefined
                if (!url || !provider) return null
                return { kind: 'iframe', iframe: { url, provider } }
              }
              if (kind === 'media') {
                const items = Array.isArray(b?.media) ? b.media : []
                const media = items
                  .map((m: any) => {
                    const type = (m?.type === 'image' || m?.type === 'video') ? m.type : undefined
                    const url = typeof m?.url === 'string' ? m.url.trim() : ''
                    if (!type || !url) return null
                    const out: any = { type, url }
                    if (typeof m?.alt === 'string') out.alt = m.alt
                    if (Number.isFinite(m?.width)) out.width = Number(m.width)
                    if (Number.isFinite(m?.height)) out.height = Number(m.height)
                    return out
                  })
                  .filter(Boolean)
                if (!media.length) return null
                return { kind: 'media', media }
              }
              return null
            })
            .filter(Boolean)
            .slice(0, 200) // safety cap
        }

        // ── NEW: нормалізація style
        if ((data as any).style && typeof (data as any).style === 'object') {
          const st = (data as any).style
          if (st.radius !== undefined) st.radius = clamp(st.radius, 0, 100)
          if (st.gap !== undefined) st.gap = clamp(st.gap, 0, 100)
        }

        return data
      },
    ],

    // Сигнал у Nest після змін (не блокує адмінку)
    afterChange: [
      async ({ doc /*, operation */ }) => {
        try {
          const id = String((doc as any).id || (doc as any)._id)

          // 1) основний синх кейсу
          const sync = fetch(`${process.env.NEST_API_URL}/api/internal/cases/sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
            },
            body: JSON.stringify({ id }),
          })

          // 2) інвалідація кешу головної
          const invalidateHome = fetch(`${process.env.NEST_API_URL}/api/internal/home/invalidate-landing`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
            },
          })

          // 3) форс-перерахунок палітри
          const rebuildPalette = fetch(`${process.env.NEST_API_URL}/api/internal/cases/${id}/rebuild-palette`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
            },
            body: JSON.stringify({ force: true }),
          })

          await Promise.allSettled([sync, invalidateHome, rebuildPalette])
        } catch {
          // ignore
        }
      },
    ],

    afterDelete: [
    async ({ doc /*, req */ }) => {
      try {
        // очистимо кеш головної на випадок, якщо видалений кейс десь у фідах
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
