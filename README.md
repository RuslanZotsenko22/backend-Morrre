🧠 Branding Platform – Backend API (NestJS + MongoDB + PayloadCMS + Vimeo)

A full-stack backend for a modern branding platform with cases, designer rankings, and collections.
The project is built with NestJS and integrates PayloadCMS and the Vimeo API.

🚀 Overview

This backend is the core of the Branding Platform ecosystem, bringing together designers, studios, and cases in a single space.
It provides:

user registration and authentication;

creation and publication of cases with multimedia sections;

integration with the Vimeo API for video management;

user ranking and voting system;

collection management via PayloadCMS;

caching of popular content using Redis.

🧩 Core Modules
Module	Description
Auth / Users	JWT authentication, OTP flow, profile editing, avatar upload, links, rating
Cases	Case creation with sections (text, images, iframe, Vimeo video), publishing, voting
Collections	Case collections management, featuring, sorting (via CMS or API)
Vimeo Integration	Upload URL generation, webhook handling, transcoding / ready status
Home / Discover	Landing page, popular content caching, ranking system
Search	User and case search with pagination
Hire CTA	Designer hiring request system
PayloadCMS	Headless CMS for collections and featured blocks
Redis	Request caching and TTL optimization for Discover
⚙️ Tech Stack
Category	Technologies
Backend	NestJS
Database	MongoDB (via Mongoose)
CMS	PayloadCMS (Next.js-based)
Cache	Redis (via ioredis)
Video	Vimeo API
Storage	Cloudinary (image storage)
Queue	BullMQ (video & statistics processing)
Auth	JWT (Access + Refresh), Throttler
Docs	Swagger UI / Postman Collection
🧠 Key Features

🔐 JWT authentication (access + refresh tokens)

🧱 Full CRUD for users, cases, and collections

🎞️ Vimeo API integration:

upload URL generation

webhook handling for video readiness

🧮 User rating system:

based on votes, views, and number of cases

🗳️ Case voting:

up/down voting with rate limiting

🧰 Headless CMS (Payload) for content editors

⚡ Redis caching for popular content

🔎 Search across users and cases

👔 Hire system (collaboration requests)

🧾 Swagger / Postman for fast API testing

🌐 Main API Endpoints
🔑 Auth / Users
Method	Route	Description
POST	/auth/register	User registration
POST	/auth/login	Authentication
GET	/users/me	Current user
PATCH	/users/me	Update profile
POST	/users/me/avatar	Upload avatar
PATCH	/users/me/password	Change password
🧱 Cases
Method	Route	Description
POST	/cases	Create case (draft)
PATCH	/cases/:id	Update sections
POST	/cases/:id/publish	Publish case
GET	/cases/:slug	Get case
POST	/cases/:id/vote	Vote for a case
🧩 Collections / Home
Method	Route	Description
GET	/collections	Get all collections
GET	/home/landing	Landing page
GET	/home/popular	Popular cases / users
🎥 Vimeo
Method	Route	Description
POST	/vimeo/upload-url	Generate upload URL
POST	/vimeo/webhook	Handle Vimeo webhooks
🧾 Example .env File
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

🧮 Rating Formula Example
score = (upvotes - downvotes) * 0.8
      + log(1 + views) * 0.2
      + bonus_pro


⚙️ The formula is adaptive — coefficients can be configured via .env or config files.

📦 Deployment
Clone
git clone https://github.com/yourname/branding-backend.git
cd branding-backend

Install
npm install

ENV

Create a .env file based on .env.example.

Run
npm run start:dev


Backend: http://localhost:4000

CMS: http://localhost:3001

🧠 Architectural Decisions

NestJS + PayloadCMS in a monorepo — a single codebase with two entry points (API + CMS).

Redis TTL cache to reduce database load.

Vimeo integration via webhooks — backend updates video status automatically.

BullMQ queues for background jobs (statistics, ratings, synchronization).

Cloudinary CDN for efficient image management.

Swagger for auto-generated API documentation.

📜 Author

Backend Developer: Ruslan Zotsenko

Stack: NestJS • Node.js • MongoDB • Redis • PayloadCMS • Vimeo API
📍 Czech Republic | 🌍 Open to freelance & partnership projects

🏁 Status

MVP completed.
Current focus: Collections module + Discover + Vimeo integration + CMS synchronization.

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

