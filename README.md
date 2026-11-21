# Trimly admin - 9800000099

> **New to this codebase?** Read [`docs/DEVELOPER-GUIDE.md`](docs/DEVELOPER-GUIDE.md) first: architecture, business rules, API reference, deploy and how-tos.


Marketplace for barbers, salons, beauty parlours & grooming services. Full product spec: [`docs/Trimly-PRD-SRS-v1 updated.md`](docs/Trimly-PRD-SRS-v1%20updated.md).

Web-first MVP per the PRD's own guidance (native/mobile is V2). Monorepo layout:

- `frontend/` — Next.js 16 (App Router, SSR salon profiles, Tailwind)
- `backend/` — NestJS 12 API (auth, search, bookings, reviews, admin)
- `database/` — Prisma schema (`prisma/schema.prisma`) + seed script, shared by `backend` via the `database` workspace package
- `docs/` — PRD/SRS
- `api/`, `design/` — reserved for an OpenAPI spec and design assets (not yet populated)

## Prerequisites

- Node.js 20+
- Docker (for local Postgres + Redis) — or point `DATABASE_URL`/`REDIS_URL` at your own instances

## First-time setup

```bash
npm install

# Postgres + Redis locally
docker compose up -d

# copy env files and adjust as needed
cp backend/.env.example backend/.env
cp database/.env.example database/.env
cp frontend/.env.local.example frontend/.env.local

# create tables, then seed demo data (one salon, one owner, one customer)
cd database && npx prisma migrate dev --name init && npm run seed && cd ..
```

## Running

```bash
npm run dev:api   # Nest API on http://localhost:4000 (routes under /api)
npm run dev:web   # Next.js on http://localhost:3000
```

Health check: `GET http://localhost:4000/api/health`.

## What's stubbed vs. real

Real: auth (OTP + JWT + RBAC), Prisma schema covering the full §8 data model, search ranking (Haversine + configurable weights), slot-hold locking via Redis, booking create/cancel/reschedule/complete/no-show state machine, reviews, admin verification, owner dashboard, the core customer/owner frontend flows.

Stubbed with a `TODO` at the integration point — needs real credentials/infra, not more design:
- Razorpay orders + payouts (webhook signature verification is real; the order-creation call itself is a placeholder)
- SMS/WhatsApp OTP delivery (currently logged to the console in development)
- BullMQ job queue for reminders/notifications (currently synchronous no-ops)
- PostGIS geo-index (search currently does a bounding-box + in-app Haversine calc, sufficient at MVP scale per ADR-003; swap in `ST_DWithin`/GIST once salon density grows)

## Workspace scripts

Root `package.json` has `dev:web`, `dev:api`, `build:web`, `build:api`, `prisma:generate`, `prisma:migrate`, `prisma:studio`.
