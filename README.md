<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

# 🚀 Branding Platform API (NestJS + MongoDB)

This is the **backend API** for a creative platform that powers **Cases**, **Users**, **Collections**, and a smart **Search** system — built with **NestJS**, **MongoDB**, and **Vimeo integration**.


## 🌐 Overview

| Parameter | Value |
|------------|--------|
| **Base URL** | `http://localhost:4000` |
| **API Prefix** | `/api` |
| **Swagger Docs** | `http://localhost:4000/docs` |

## 🌐 Overview

| Service | URL | Description |
|----------|-----|-------------|
| **Backend (NestJS)** | `http://localhost:4000` | Main API server |
| **CMS (Payload)** | `http://localhost:3001` | Admin panel |
| **Swagger Docs** | `http://localhost:4000/docs` | API documentation |

## ⚙️ Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd backend
npm install

# 2. Configure ENV
echo "
PORT=4000
MONGO_URI=mongodb://localhost:27017/branding
JWT_SECRET=change_me
" > .env

# 3. Run locally
npm run start:dev
🔐 Auth
JWT Bearer token authorization:


Authorization: Bearer <access_token>
Public endpoints (e.g. /api/search) don’t require auth.

Refresh tokens: /api/auth/refresh.

🌍 CORS & Static Files
Type	URL	Folder
Hire uploads	/uploads/hire/...	uploads/hire
Case uploads	/uploads/cases/...	uploads/cases

CORS allows:


origin: ['http://localhost:3001']
🔎 Global Search API
Endpoint

GET /api/search
Query Params
Param	Type	Default	Description
q	string	—	Search query
type	`'all'	'users'	'cases'`
limit	number (1–50)	10	Max results

Example Response

{
  "q": "ann",
  "users": [{ "displayName": "Anna", "isPro": true }],
  "cases": [{ "title": "Branding for Café", "authorName": "Anna" }],
  "background": { "kind": "user", "url": "https://cdn.../ann.jpg" }
}
Frontend tips
Debounce 250–350 ms for input

Show Users / Cases tabs

Use background.url for preview area

Show Pro badge if isPro === true

🧩 Main Endpoints
👤 Users
Method	Endpoint	Description
GET	/api/users/:id/profile	Public profile
GET	/api/users/:id/cases	User’s cases
GET	/api/users/:id/stats	User stats

🎨 Cases
Method	Endpoint	Description
GET	/api/cases/:idOrSlug	Case details
GET	/api/cases/discover	Discover feed
GET	/api/cases/popular-slides	Popular today

🗂️ Collections
Method	Endpoint	Description
GET	/api/collections/featured	Featured (6)
GET	/api/collections	All collections
GET	/api/collections/:slug	Single collection

🧱 Error Format

{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
Code	Meaning
400	Validation error
401	Unauthorized
403	Forbidden
404	Not found
429	Rate limit exceeded
500	Server error

🧰 Tech Stack
NestJS — backend framework

MongoDB + Mongoose — database

Swagger — API docs

Redis + BullMQ — queues

Vimeo API — video integration

Cloudinary (optional) — media CDN
