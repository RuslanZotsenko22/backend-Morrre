
import { CollectionConfig } from 'payload';

function toArrayOfStrings(input: unknown, limit = 50): string[] {
  if (typeof input === 'string') {
    const s = input.trim();
    return s ? [s] : [];
  }
  if (Array.isArray(input)) {
    const out: string[] = [];
    for (const v of input) {
      if (typeof v === 'string') {
        const s = v.trim();
        if (s && !out.includes(s)) out.push(s);
      } else if (v && typeof v === 'object' && typeof (v as any).value === 'string') {
        const s = (v as any).value.trim();
        if (s && !out.includes(s)) out.push(s);
      }
      if (out.length >= limit) break;
    }
    return out;
  }
  return [];
}

export const Cases: CollectionConfig = {
  slug: 'cases',
  admin: { useAsTitle: 'title' },

  access: {
    read: () => true, // або фільтрувати тільки published
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

    //  Лояльні до формату даних: string OR string[]
    { name: 'tags', type: 'json' },
    { name: 'categories', type: 'json' },

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
        //  приймає { low: {url}, mid: {url}, full: {url} } тощо
        { name: 'sizes', type: 'json' },
      ],
    },

    {
      name: 'videos',
      type: 'array',
      fields: [
        { name: 'provider', type: 'text', defaultValue: 'vimeo' },
        { name: 'externalId', type: 'text' }, // vimeo video id
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

        // Технічні поля, щоб не падати, якщо вони є в БД:
        { name: 'originalName', type: 'text', admin: { condition: () => false } },
        { name: 'size', type: 'number', admin: { condition: () => false } },
        { name: 'mimetype', type: 'text', admin: { condition: () => false } },
      ],
    },

    { name: 'ownerId', type: 'relationship', relationTo: 'users', required: true },
  ],

  hooks: {
    // 🔧 Нормалізація при читанні (щоб лістинг у адмінці не падав)
    beforeRead: [
      async ({ doc }) => {
        if (!doc) return doc;

        try {
          // tags / categories → завжди масиви рядків у відрендереному документі
          if (doc.tags !== undefined) {
            doc.tags = toArrayOfStrings(doc.tags, 50);
          }
          if (doc.categories !== undefined) {
            doc.categories = toArrayOfStrings(doc.categories, 50);
          }

          // videos.status — нічого не чіпаємо, але якщо раптом строкові «масиви» потрапляли — не падаємо
          if (Array.isArray(doc.videos)) {
            doc.videos = doc.videos.map((v: any) => {
              if (!v || typeof v !== 'object') return v;
              // м’яко приводимо деякі поля до рядків
              if (v.externalId != null && typeof v.externalId !== 'string') {
                v.externalId = String(v.externalId);
              }
              if (v.url != null && typeof v.url !== 'string') {
                v.url = String(v.url);
              }
              if (v.status != null && typeof v.status !== 'string') {
                v.status = String(v.status);
              }
              return v;
            });
          }
        } catch {
          // тихо ігноруємо — краще показати лістинг, ніж упасти
        }

        return doc;
      },
    ],

    //  Сигнал у Nest після змін
    afterChange: [
      async ({ doc, operation }) => {
        if (operation === 'delete') return;
        try {
          await fetch(`${process.env.NEST_API_URL}/api/internal/cases/sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
            },
            body: JSON.stringify({ id: String((doc as any).id || (doc as any)._id) }),
          });
        } catch {
          // не блокуємо адмінку
        }
      },
    ],
  },
};
