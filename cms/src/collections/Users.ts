import { CollectionConfig } from 'payload';

export const Users: CollectionConfig = {
  slug: 'users', // та сама колекція, що у Nest
  admin: { useAsTitle: 'name' },
  access: {
    read: () => true,
    create: ({ req }) => req.user?.collection === 'admins',   
    update: ({ req }) => req.user?.collection === 'admins',
    delete: ({ req }) => req.user?.collection === 'admins',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'avatar', type: 'text' },               
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
    
    // 🆕 НОВІ ПОЛЯ ДЛЯ БОТНЕТУ (додаємо в кінець)
    {
      name: 'isBot',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        hidden: true, // Ховаємо, щоб не плутати з реальними користувачами
        description: 'Позначає, чи є цей обліковий запис ботом',
      },
    },
    {
      name: 'canVote',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Чи може цей користувач/бот голосувати за кейси',
        condition: (data) => data?.isBot, // Показуємо тільки для ботів
      },
    },
    {
      name: 'lastBotActivity',
      type: 'date',
      admin: {
        description: 'Остання активність бота',
        readOnly: true,
        condition: (data) => data?.isBot, // Показуємо тільки для ботів
      },
    },
    {
      name: 'botActivityCount',
      type: 'number',
      defaultValue: 0,
      admin: {
        description: 'Кількість виконаних активностей',
        readOnly: true,
        condition: (data) => data?.isBot, // Показуємо тільки для ботів
      },
    },
  ],
};