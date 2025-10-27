# 🧠 Branding Platform – Backend API (NestJS + MongoDB + PayloadCMS + Vimeo)

> **Full-stack backend для сучасної платформи з кейсами, рейтингом дизайнерів і колекціями.**
> Проект реалізований на NestJS із інтеграцією PayloadCMS та Vimeo API.

---

## 🚀 Огляд

Цей бекенд — основа екосистеми **Branding Platform**, яка об’єднує дизайнерів, студії та кейси в одному просторі.  
Він забезпечує:
- реєстрацію та авторизацію користувачів;
- створення та публікацію кейсів із мультимедійними секціями;
- інтеграцію з **Vimeo API** для роботи з відео;
- рейтинг користувачів і систему голосування;
- управління колекціями через **PayloadCMS**;
- кешування популярного контенту через Redis.

---

## 🧩 Основні модулі

| Модуль | Опис |
|:--|:--|
| **Auth / Users** | Авторизація (JWT), OTP flow, редагування профілю, аватар, посилання, рейтинг |
| **Cases** | Створення кейсів із секціями (текст, зображення, iframe, відео Vimeo), публікація, голосування |
| **Collections** | Управління колекціями кейсів, фічеринг, сортування (через CMS або API) |
| **Vimeo Integration** | Отримання upload-URL, обробка webhook-ів, статус transcoding / ready |
| **Home / Discover** | Головна сторінка, кешування популярного контенту, система ранжування |
| **Search** | Пошук по користувачах і кейсах із пагінацією |
| **Hire CTA** | Система заявок на найм дизайнерів |
| **PayloadCMS** | Headless CMS для колекцій і популярних блоків |
| **Redis** | Кешування запитів і TTL-оптимізація Discover |

---

## ⚙️ Технологічний стек

| Категорія | Технології |
|:--|:--|
| **Backend** | [NestJS](https://nestjs.com/) |
| **Database** | [MongoDB](https://www.mongodb.com/) (через Mongoose) |
| **CMS** | [PayloadCMS](https://payloadcms.com/) (Next.js-based) |
| **Cache** | Redis (через ioredis) |
| **Video** | [Vimeo API](https://developer.vimeo.com/api/guides/start) |
| **Storage** | Cloudinary (зберігання зображень) |
| **Queue** | BullMQ (обробка відео/статистики) |
| **Auth** | JWT (Access + Refresh), Throttler |
| **Docs** | Swagger UI / Postman Collection |

---



## 🧠 Ключові можливості

- 🔐 **JWT-аутентифікація** (access + refresh токени)
- 🧱 **CRUD-операції** для користувачів, кейсів і колекцій
- 🎞️ **Інтеграція з Vimeo API**
  - отримання upload-URL
  - webhook із підтвердженням готовності відео
- 🧮 **Рейтинг користувачів**
  - обчислення на основі голосів, переглядів і кількості кейсів
- 🗳️ **Голосування за кейси**
  - up/down система з rate-limit
- 🧰 **Headless CMS (Payload)** для контент-редакторів
- ⚡ **Redis-кешування** популярного контенту
- 🔎 **Пошук по користувачах і кейсах**
- 👔 **Hire-система** (заявки на співпрацю)
- 🧾 **Swagger / Postman** для швидкого тестування API

---

## 🌐 Основні API-ендпоїнти

### 🔑 Auth / Users
| Метод | Роут | Опис |
|:--|:--|:--|
| `POST` | `/auth/register` | Реєстрація користувача |
| `POST` | `/auth/login` | Авторизація |
| `GET` | `/users/me` | Поточний користувач |
| `PATCH` | `/users/me` | Оновлення профілю |
| `POST` | `/users/me/avatar` | Завантаження аватару |
| `PATCH` | `/users/me/password` | Зміна паролю |

### 🧱 Cases
| Метод | Роут | Опис |
|:--|:--|:--|
| `POST` | `/cases` | Створити кейс (чернетку) |
| `PATCH` | `/cases/:id` | Оновити секції |
| `POST` | `/cases/:id/publish` | Опублікувати кейс |
| `GET` | `/cases/:slug` | Отримати кейс |
| `POST` | `/cases/:id/vote` | Голосування за кейс |

### 🧩 Collections / Home
| Метод | Роут | Опис |
|:--|:--|:--|
| `GET` | `/collections` | Отримати всі колекції |
| `GET` | `/home/landing` | Головна сторінка |
| `GET` | `/home/popular` | Популярні кейси / користувачі |

### 🎥 Vimeo
| Метод | Роут | Опис |
|:--|:--|:--|
| `POST` | `/vimeo/upload-url` | Створення upload-URL |
| `POST` | `/vimeo/webhook` | Обробка webhook-ів Vimeo |

---

## 🧾 Приклад `.env` файлу

```bash
# Server
PORT=4000
NODE_ENV=development

# Mongo
MONGO_URI=mongodb+srv://user:pass@cluster/dbname

# Auth
JWT_ACCESS_SECRET=supersecret
JWT_REFRESH_SECRET=supersecret2
ACCESS_EXPIRES_IN=15m
REFRESH_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=http://localhost:3000,https://yourfrontend.com

# Redis
REDIS_URL=redis://localhost:6379

# Cloudinary
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Vimeo
VIMEO_CLIENT_ID=...
VIMEO_CLIENT_SECRET=...
VIMEO_ACCESS_TOKEN=...
VIMEO_WEBHOOK_SECRET=...
VIMEO_WEBHOOK_URL=https://api.yourdomain.com/vimeo/webhook

# PayloadCMS
PAYLOAD_SECRET=...
PAYLOAD_PUBLIC_SERVER_URL=http://localhost:3001

🧮 Приклад формули рейтингу
score = (upvotes - downvotes) * 0.8 + log(1 + views) * 0.2 + bonus_pro


⚙️ Формула адаптивна — коефіцієнти можна змінювати через .env або конфігураційні файли.
📦 Деплой

Клонування

git clone https://github.com/yourname/branding-backend.git
cd branding-backend

Інсталяція

npm install

ENV
Створи файл .env на основі .env.example.

Запуск

npm run start:dev

Бекенд: http://localhost:4000
CMS: http://localhost:3001

🧠 Архітектурні рішення

NestJS + PayloadCMS у монорепозиторії — єдина кодова база з двома entry-point (API + CMS).

Redis TTL-кеш для зменшення навантаження на БД.

Vimeo інтеграція через webhook — бекенд оновлює статус відео автоматично.

BullMQ черги для фонових обчислень (статистика, рейтинг, синхронізація).

Cloudinary CDN — легке керування зображеннями.

Swagger — автогенерація API-документації для фронтенду.

📜 Автор

Backend Developer: Ruslan Zotsenko

Stack: NestJS • Node.js • MongoDB • Redis • PayloadCMS • Vimeo API
📍 Чехія | 🌍 Відкритий до фріланс/партнерських проєктів

🏁 Статус

MVP готовий.
Поточний фокус — модуль Collections + Discover + Vimeo інтеграція + CMS синхронізація.

