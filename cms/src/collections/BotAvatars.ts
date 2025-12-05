import { CollectionConfig } from 'payload/types';

export const BotAvatars: CollectionConfig = {
  slug: 'bot-avatars',
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'assignedToBot', 'isAssigned'],
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  upload: {
    staticURL: '/bot-avatars',
    staticDir: 'bot-avatars',
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif'],
    imageSizes: [
      {
        name: 'thumbnail',
        width: 100,
        height: 100,
        position: 'centre',
      },
    ],
  },
  fields: [
    {
      name: 'assignedToBot',
      type: 'relationship',
      relationTo: 'bots',
      hasMany: false,
      admin: {
        condition: (data) => Boolean(data?.assignedToBot),
      },
    },
    {
      name: 'isAssigned',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'usageCount',
      type: 'number',
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
};