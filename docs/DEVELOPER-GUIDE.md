# Trimly — Developer Guide

**Who this is for:** any developer (or AI assistant) picking up this codebase
cold. Read this first; it explains what the app does, how it is built, how to
run and deploy it, and the rules that are easy to break by accident.

| Document | What it's for |
|---|---|
| **`docs/DEVELOPER-GUIDE.md`** (this file) | The complete picture: architecture, flows, API, conventions, gotchas. |
| `docs/Trimly-PRD-SRS-v1 updated.md` | Product requirements: *what* to build and *why*. Source of truth for product decisions. |
| `CLAUDE.md` | Condensed briefing for Claude sessions (same facts, terser). |
| `PROGRESS.md` | Dated build log: what changed, when, and why. |
| `README.md` | Quick local-setup commands. |

_Last updated: 2026-11-21 (first release + founder batch 3)._

---

## 1. What Trimly is

A two-sided marketplace for booking barbers, salons, beauty parlours and spas
in India.

- **Customers** search nearby salons, compare them, book a slot, get a
  6-digit confirmation code, add services to a booking, call the salon
  without seeing its number, and leave reviews.
- **Salon owners** list their salon (it goes live after an admin verifies
  it), manage photos, services, staff, location and booking cut-off, and run
  the day from a dashboard (check-in, complete, no-show, cancel, call the
  customer).
- **Admins** verify or unlist salons and browse customers, owners and
  bookings.

It is **web-first and mobile-first**: real users are on phones, so every
screen is designed for a ~390px-wide viewport first. Native apps are a V2
item in the PRD.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **Next.js 16.3** (App Router, Turbopack), React 19, Tailwind CSS v4 | Next 16 differs from 15. Read `frontend/node_modules/next/dist/docs/` before nontrivial App Router work. |
| Backend | **NestJS 12** on Node 20 (ESM) | Uses **vitest** and **oxlint** (Nest 12 defaults), not jest/eslint. |
| Database | **PostgreSQL 16** via **Prisma 6.19.3** | Pinned to 6.x on purpose; 7+/8 change the config style. Don't bump casually. |
| Cache / locks | **Redis 7** (ioredis) | OTP storage + rate limits, slot-hold locks. |
| Validation | **Zod** on every request body/query | PRD requirement; not class-validator. |
| Auth | Phone OTP → JWT | No password, Google or email login yet. |
| Hosting | **Render** (Blueprint in `render.yaml`) | Free tier: services sleep when idle (~1 min cold start). |
| Package manager | npm workspaces (npm 10) | No pnpm/yarn. |

---

## 3. Repository map

```
barber-marketplace/
├── frontend/                  Next.js app (customer, owner and admin UI)
│   └── src/
│       ├── app/               One folder per route (see §8)
│       ├── components/        Shared UI (BusinessCard, Nav, MobileTabBar, AvatarPicker, CallButton, CompareSection…)
│       └── lib/               api.ts (fetch wrapper), auth-client.ts (token storage), types.ts, image.ts (upload + time helpers)
├── backend/                   NestJS API
│   └── src/
│       ├── main.ts            Bootstrap: timezone, CORS, body limit, /api prefix
│       ├── app.module.ts      Global guards (JWT + roles), modules
│       ├── common/
│       │   ├── scheduling/    ★ All opening-hours / slot / grace-period rules (schedule.ts + tests)
│       │   ├── redis/         Redis client + SlotLockService
│       │   ├── validation/    Shared Zod schemas (image URLs)
│       │   ├── guards/ decorators/ pipes/ filters/ geo/
│       ├── config/env.schema.ts   Every env var, validated at boot
│       └── modules/           auth, users, businesses (+owner), bookings, reviews, payments, admin, catalog
├── database/                  Prisma schema, migrations, seed (a workspace package the backend imports as `database`)
├── docs/                      PRD + this guide
├── docker-compose.yml         Local Postgres 16 + Redis 7
├── render.yaml                Render Blueprint (backend, web, Redis, Postgres)
├── CLAUDE.md / PROGRESS.md / README.md
```

---

## 4. Running it locally

Prerequisites: Node 20, npm 10, Docker Desktop.

```bash
# 1. Database + Redis
docker compose up -d
#   Windows Git Bash: docker isn't on PATH by default —
#   export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"

# 2. Env files
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local

# 3. Install, migrate, seed
npm install
npm run prisma:generate
cd database && npx prisma migrate dev && npm run seed && cd ..

# 4. Run (two terminals)
npm run dev:api     # http://localhost:4000/api
npm run dev:web     # http://localhost:3000
```

### Test accounts (seeded)

Log in with any phone number. In development the OTP is returned in the API
response (`devOtp`) and shown on the login screen, since no SMS provider is
connected yet.

| Role | Phone | Notes |
|---|---|---|
| Admin | `+91 9800000099` | Admins can't self-register; this one is seeded. |
| Owner | `+91 9800000001` | Owns "Style Studio Unisex Salon" (Mumbai). |
| Customer | `+91 9800000002` | "Anita Customer". |
| New user | any other number | Becomes a customer or owner depending on the login choice. A role is fixed at first sign-up and can't be changed. |

The seed creates 12 fictional salons in Mumbai and Bangalore, with services,
staff, placeholder photos and reviews. It's **idempotent**: re-running skips
salons that already exist.

### Checks before you push

```bash
cd backend  && npx tsc --noEmit -p tsconfig.json && npm run lint && npx vitest run
cd frontend && npx tsc --noEmit -p tsconfig.json && npx eslint src && npx next build
```

---

## 5. Deployment (Render)

`render.yaml` is a **Blueprint**: one "Apply" in the Render dashboard creates
everything, and every push to `main` redeploys automatically.

| Render service | What | Build does |
|---|---|---|
| `trimly-backend` | NestJS API — live at `https://trimly-backend-3w0i.onrender.com/api` | install → prisma generate → **migrate deploy** → **seed** (idempotent) → build |
| `trimly-web` | Next.js | install → build (with `NEXT_PUBLIC_API_URL` baked in) |
| `trimly-redis` | Render Key Value (free) | — |
| `trimly-db` | Postgres (free) | — |

Things to know:

- **Service URLs got a random suffix** because the plain names were taken.
  The web app is built against the backend URL above
  (`NEXT_PUBLIC_API_URL`). Because the value is fixed at build time, the web
  service must be redeployed after changing it. The backend allows the web
  app's origin via `WEB_APP_URL_PATTERN` (a regex matching
  `trimly-web[-suffix].onrender.com`) plus `WEB_APP_URL` (an exact
  comma-separated list).
- **`TZ=Asia/Kolkata`** is set on the backend. Don't remove it (see §7.1).
- **`NODE_ENV=development` on purpose**: it makes the API return the OTP
  (`devOtp`) so login works without an SMS provider. Switch it to
  `production` once SMS is connected.
- **Lockfile gotcha:** the root `package-lock.json` must list the **Linux**
  native binaries (`lightningcss-linux-x64-gnu`,
  `@tailwindcss/oxide-linux-x64-gnu`, `@next/swc-linux-x64-gnu`), or the
  Render build fails with `Cannot find module '../lightningcss.linux-x64-gnu.node'`.
  npm on Windows silently drops them. To regenerate: copy the root and
  workspace `package.json` files into an empty folder, run
  `npm install --package-lock-only` there **without** a lockfile, and copy the
  result back. Check with `grep linux-x64-gnu package-lock.json`.
- Free tier: services sleep after ~15 min idle, so the first request takes
  about a minute.

### Environment variables (backend)

All validated at boot by `backend/src/config/env.schema.ts`. The app refuses
to start if a required one is missing.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection |
| `REDIS_URL` | ✅ | Redis connection |
| `JWT_SECRET` | ✅ (≥16 chars) | Signs login tokens |
| `JWT_EXPIRES_IN` | | Default `7d` |
| `PORT` | | Default `4000` |
| `NODE_ENV` | | `development` returns `devOtp` (see above) |
| `TZ` | strongly recommended | `Asia/Kolkata` (main.ts defaults it if unset) |
| `WEB_APP_URL` / `WEB_APP_URL_PATTERN` | | CORS origins (list / regex) |
| `SEARCH_WEIGHT_DISTANCE` / `_RATING` / `_AVAILABILITY` | | Search ranking weights (PRD: must be configurable) |
| `EXOTEL_SID`, `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN`, `EXOTEL_CALLER_ID` (+ optional `EXOTEL_SUBDOMAIN`) | for calling | Masked calls. Without them the call button says "coming soon". |
| `RAZORPAY_*`, `SMS_PROVIDER_API_KEY`, `CLOUDINARY_*` | not used yet | Reserved for payments / SMS / image storage |

Frontend: only `NEXT_PUBLIC_API_URL`, which is fixed at build time.

---

## 6. Architecture

```
 Phone browser
      │  HTTPS (JSON, Bearer JWT)
      ▼
 ┌──────────────┐        ┌───────────────────────────────────────────┐
 │  Next.js web │──────▶ │ NestJS API  (/api)                        │
 │  (SSR + CSR) │        │  Global guards: JwtAuthGuard + RolesGuard │
 └──────────────┘        │  Zod pipes · one error envelope           │
                         │                                           │
                         │  auth · users · businesses · bookings ·   │
                         │  reviews · payments · admin · catalog     │
                         └───────┬──────────────────┬────────────────┘
                                 │ Prisma           │ ioredis
                                 ▼                  ▼
                           PostgreSQL            Redis
                         (all app data)   (OTP codes, rate limits,
                                            slot-hold locks)
       External (env-gated): Exotel (masked calls) · Razorpay (stub) · SMS (stub)
```

### Backend conventions (break these and things fail in confusing ways)

1. **Every endpoint requires a JWT by default.** Use `@Public()` to opt out,
   and `@Roles('OWNER', …)` to restrict by role. A new endpoint that 401s or
   403s unexpectedly almost always lacks one of these two decorators.
2. **Validate with Zod, bound to the parameter:**
   `@Body(new ZodValidationPipe(schema)) dto`. **Never** use method-level
   `@UsePipes(...)`: it validates *every* parameter (the JWT user, the
   `:id`) against the schema and fails with "Required" on every field.
3. **ESM:** every relative import needs a `.js` extension
   (`import { X } from './x.service.js'`), even though the files are `.ts`.
4. **Prisma types and client come `from 'database'`** (the workspace
   package), not `@prisma/client`. After a schema change, run
   `npx prisma migrate dev --name <what>` in `database/`.
5. **ioredis:** use `import { Redis } from 'ioredis'` (named import).
6. **Cross-cutting providers belong in an existing `@Global()` module**
   (e.g. `RedisModule`), not in `AppModule`. Dependency-injection errors only
   show up at runtime, so boot the app to check, not just `tsc`.
7. **Two files importing each other** breaks under ESM at runtime ("Cannot
   access X before initialization"). Fix it by moving the shared constant
   into its own file.
8. **Errors** all come back as
   `{ error: { statusCode, message, details, path, timestamp } }`.
   The frontend's `apiFetch` shows `details[0].message` when present.
9. **Ownership checks:** any owner endpoint touching a child record
   (service, staff, media) must verify that it belongs to the `:id` business,
   not only that the caller owns `:id`.

---

## 7. Core business rules

### 7.1 Time zone, opening hours and slots — `backend/src/common/scheduling/schedule.ts`

This module is the **single source of truth** for "is it open" and "can this
be booked". Both the slot list (`BusinessesService.availability`) and booking
creation (`BookingsService.staffAvailableForSlot`) call it, so they can't
disagree. If you change a rule, change it here and add a test in
`schedule.spec.ts`.

- **Timezone.** Working hours are stored as local wall-clock strings
  (`{"mon": {"open": "09:00", "close": "19:00", "closed": false}, …}`). The
  API process **must run in IST**. Render runs in UTC by default, which once
  made every slot start at 2:30 PM. `main.ts` sets `process.env.TZ ||=
  'Asia/Kolkata'`, and `render.yaml` sets `TZ` explicitly.
- **Date-only columns.** Postgres `@db.Date` columns (staff day-off
  overrides, waitlist dates) must be queried with `dbDateFor(localDay)`.
  Local midnight in IST is the *previous* day in UTC.
- **Owner-editable hours** (Manage → Opening hours, `WorkingHoursEditor`):
  per day `{open, close, closed, breaks: [{start, end}]}`, any time up to
  23:59, up to 3 breaks a day. Validated in `create-business.dto.ts` (close
  after open, breaks inside hours). **Breaks** (e.g. lunch) split the day
  (`breaksFor` / `subtractBreaks`); a service must always finish before a
  break starts, even when the closing cut-off is relaxed. A salon on its
  break is not "open now". The salon page shows hours with `HoursList`,
  always Monday → Sunday (Postgres JSONB doesn't keep key order).
- **Salon hours always win.** A stylist's hours are clipped to the salon's
  hours for that day. On a closed day there are **no slots** (this used to
  allow booking a salon shown as "Closed").
- **Stylists with no hours configured** default to the salon's full hours.
  There is **no owner UI for per-stylist shifts**, so in practice every
  stylist follows the salon's hours. The seed used to give demo stylists a
  fixed 09:00–20:00 shift, which capped late-closing salons at 8 PM; it no
  longer does, and migration `remove_seeded_staff_shifts` deleted those
  rows.
- **Start times** are offered every **15 minutes** (`SLOT_STEP_MINUTES`).
- **Last booking of the day** (`fitsWindow`):
  - Default (`Business.lastBookingCutoffMinutes = null`): the **whole
    service must finish by closing**. A 9 AM–7 PM salon with a 60-min
    service → last start 6:00 PM; a 2-hour service → 5:00 PM.
  - Owner setting "Accept bookings until X min before closing" (0–240): last
    start = closing − X for every service; the service may run past
    closing.
- **10-minute late grace** (`LATE_GRACE_MINUTES`, `isBlocking`): a
  `CONFIRMED` booking that hasn't been checked in (moved to `IN_PROGRESS`)
  within 10 minutes of its start **stops blocking** the stylist's time, so
  the rest of that slot can be booked by someone else. The status is **never
  changed automatically** (PRD §4.5: no-shows are recorded by the owner). The
  owner dashboard flags the booking (`lateNoShowCandidate`) and offers
  *Mark no-show* or *Cancel*.
  ⚠️ So owners must tap **"Customer arrived"** when someone walks in.
- **Busy colours.** `GET /businesses/:id/availability` returns a `grid`:
  for each start time, `available` / `total` stylists and the free
  `staffIds`. The booking page colours each time green (more than half the
  stylists free), amber (half or fewer) or grey (full), and shows a trend per
  Morning / Afternoon / Evening.

### 7.2 Booking lifecycle — `backend/src/modules/bookings/bookings.service.ts`

```
            create (Pay at shop)
                   │
                   ▼
   ┌──────────► CONFIRMED ──── start (owner: "Customer arrived") ──► IN_PROGRESS
   │               │  │                                                  │
   │  reschedule   │  └── complete (owner enters customer's code) ◄──────┘
   │  (customer)   │                     │
   └───────────────┤                     ▼
                   │                 COMPLETED ──► review (customer) ──► (hasReview)
                   ├── cancel (customer or owner) ──► CANCELLED
                   └── no-show (owner only, after 10-min grace) ──► NO_SHOW
```

- **Create:** a short Redis lock on (salon, stylist, start) stops two people
  grabbing the same slot. A 6-digit code is generated: its hash checks
  completion, and the plain code is kept so the customer can see it again
  under *Upcoming*. It is only ever returned to that customer, never in
  owner payloads.
- **Pay online is disabled** in both UI and API
  (`assertPaymentMethodAvailable`), because Razorpay order creation is still
  a stub and a `PAY_NOW` booking would sit `PENDING` holding the slot. Remove
  both when payments go live.
- **Cancel:** the salon cancelling means a full refund. A customer
  cancelling refunds according to the salon's cancellation policy (default:
  free up to 2 hours before). Cancelling also notifies the first waitlisted
  customer, at the database level only (no messages are sent yet).
- **Add services:** `POST /bookings/:id/add-services`, by the customer,
  before the start time. Creates `BookingAddOn` rows, extends `slotEnd`
  (only if the same stylist is still free) and raises the unpaid amount.
- **No-show:** the owner records it with a reason. The customer's
  reliability score drops; 2+ no-shows in a trailing 90 days would require
  prepayment.
- **Masked call:** `POST /bookings/:id/call` (customer or owner, active
  bookings). Exotel first rings the caller, then connects them to the other
  side, showing the platform's number both ways. No real number is ever
  shown. Customer phone numbers are deliberately **not** included in the
  owner dashboard payload.

### 7.3 Search and ranking — `businesses.service.ts`

A bounding-box pre-filter in SQL, then exact Haversine distance and weighted
scoring (distance / rating / open-now) in code. PostGIS is deliberately not
used yet (PRD ADR-003). Weights come from env vars. With no results, filters
are relaxed (rating, then category) so the screen is never a dead end. Only
`VERIFIED` salons ever appear publicly.

### 7.4 Images (salon photos, service photos, profile pictures)

There's no object storage yet. The browser **downscales** the chosen photo
(≤1280px, JPEG, ~100–300 KB; `frontend/src/lib/image.ts`) and sends it as a
`data:image/jpeg;base64,…` URL, which is stored as-is in Postgres
(`BusinessMedia.url`, `Service.imageUrl`, `User.avatarUrl`). It's validated
by `common/validation/image-url.ts` (http(s) or data:image URL, ≤ ~1.5 MB).
The API body limit is raised to 3 MB in `main.ts`.
**Next step at scale:** upload to Cloudinary or S3 and store only the URL.
The `CLOUDINARY_*` env vars already exist.

### 7.5 Location and maps

**Search radius.** The customer picks "Within 2 / 5 / 7 / 10 / 15 km"
(chips in `SearchBar`, saved in the `trimly_radius` cookie, default **7 km**).
It's resolved in `resolveSearchLocation()` the same way as the location
(URL → cookie → default). An empty result offers "Search within N km" with
the next size up.

**Customer search location.** "Near me" saves the coordinates in a
`trimly_loc` cookie (30 days, `lib/location.ts`). Home and Search are server
components and resolve the location with `resolveSearchLocation()`
(`lib/location-server.ts`): an explicit `?lat=&lng=` in the URL wins, then the
saved cookie, then Mumbai. Don't inject fallback coordinates into the URL
from the client: that used to override the saved location (and the Home tab
links to plain `/`, which used to forget it).


The owner sets the exact location under Manage → Location: "Use my current
location" (browser GPS) or a pasted full Google Maps link, plus an address /
landmark. Customers see an **OpenStreetMap embed** and a **Google Maps
directions link**. Neither needs an API key. New salons created without GPS
default to Mumbai's coordinates, so owners should set their location.

### 7.6 Featured salons and achievements — `modules/businesses/achievements.ts`

The home list is presented as **"✨ Featured salons in your area"** (the
ranked nearby results). Salons earn **achievements** automatically from real
data. They're computed on each request, nothing is stored, and a salon is
never shown an achievement it hasn't earned:

| Achievement | Rule |
|---|---|
| 🚀 Rising Star | First 90 days on Trimly, ≥1 review, rating ≥ 4★ |
| ⭐ Top Rated | Rating ≥ 4.5★ from ≥ 3 reviews |
| 🔥 5-Star Streak | Last 3 reviews all 5★ |
| 🎉 / 🏅 / 🏆 | 10 / 50 / 100 completed visits |
| 💬 Much Loved | ≥ 25 reviews |

Customers see earned ones on cards (top one) and the salon page (all).
Owners see all of them on their dashboard, with progress bars toward the
ones not yet earned. To add one, add it to `computeAchievements()` and the
`PRIORITY` list.

### 7.7 Style Finder — `/styles`, `frontend/src/lib/faceShape.ts`, `modules/styles`

A tab where customers browse men's and women's cuts and see how well each
suits their face.

- **Catalogue:** `hair_styles` table (name, gender, description, length,
  upkeep, `faceShapeFit` = 0–100 per shape: oval, round, square, heart,
  oblong, diamond; `imageUrl`). 28 starter styles (14 + 14) are seeded with
  scores from standard face-shape styling guidance. They're upserted by
  (name, gender) and **never overwritten**, so admin edits survive re-seeding.
- **Photos:** starter photos are free **Unsplash** images (Unsplash License:
  free commercial use, no permission needed), hand-picked so each one shows
  its cut, hotlinked from `images.unsplash.com` (`STYLE_PHOTOS` in the seed).
  The seed only fills styles with **no** photo, so admin uploads are never
  replaced. Admins can replace photos (Admin → "Style Finder catalogue"; same
  on-device resize + data-URL storage as other uploads), add styles and hide
  them. A style without a photo shows an illustrated placeholder.
  Unsplash doesn't guarantee model releases, so swap in your own salon photos
  once you have them.
- **Face analysis runs entirely in the browser; the photo is never
  uploaded.** Google MediaPipe Face Landmarker (`@mediapipe/tasks-vision@0.10.14`
  plus the float16 model, ~4 MB) is **loaded at runtime from jsDelivr / Google
  Storage**, not bundled. That keeps it out of the bundle and out of the
  lockfile (see the Linux lockfile gotcha). The landmarks give three
  proportions (length ÷ cheekbone width, jaw ÷ cheekbone, forehead ÷
  cheekbone), compared with typical values for each shape to get
  probabilities. Match % = Σ P(shape) × the style's score for that shape.
  Photo checks: no face, more than one face, face too small, head turned.
- **Robust photo handling** (fixed after a real phone selfie came back "no
  face"): phones store portraits sideways with an EXIF rotate flag. The
  photo is decoded upright with `createImageBitmap(file, { imageOrientation:
  'from-image' })` and downscaled to 1024px. If no face is found, it retries
  with a grey border (close-ups touching the edges), then rotated 90°, 270°
  and 180° (missing or wrong flag). Detector confidence thresholds are 0.3
  (default 0.5). A tip asks for the whole face when the forehead or chin
  touches the edge, since a cropped face reads rounder. Tested: normal,
  phone-style sideways+flag, sideways without flag and tight close-up are all
  detected; a back-of-head photo is rejected.
- **It's an estimate.** The prototype proportions in `faceShape.ts` are
  hand-calibrated; the UI says it's a styling guide, not a guarantee.
  Verified end to end on a sample portrait (Oval, 54%, matches 76–91%). If
  results look skewed on real users, tune `PROTOTYPES` / `SPREAD`.

---

## 8. Frontend page map (`frontend/src/app`)

| Route | Who | What |
|---|---|---|
| `/` | everyone | Nearby salons (server-rendered), filters, **Compare two salons** section at the bottom |
| `/search` | everyone | Full search |
| `/salons/[id]` | everyone | Salon profile (server-rendered for SEO): open status, services with photos, stylists, hours, map + directions, reviews |
| `/salons/[id]/book` | customer | Service → date chips (closed days marked) → colour-coded times → confirm. Confirmation shows the code and the "reach on time" notice |
| `/styles` | everyone | **Style Finder**: selfie/upload → face shape → "Compare with my face" per cut (match %), "Compare all", best matches first, Women's/Men's toggle |
| `/compare?a=&b=` | everyone | Side-by-side comparison; ✓ marks the better value; same-name services priced side by side |
| `/login` | everyone | Phone + OTP; redirects by role (or to `?next=`) |
| `/account` | customer | Profile + photo, Upcoming / Past bookings. Tap a booking for details: code, add services, call salon, directions, cancel, review |
| `/owner` | owner | First-time salon setup, or the dashboard: today's bookings with Arrived / Complete (code) / No-show / Cancel / Call, refreshed every minute |
| `/owner/manage` | owner | Photos (upload from phone), location, **opening hours + breaks**, last booking time, services (+ photos), staff |
| `/admin` | admin | Clickable stat tiles → searchable lists: salons by status (verify / reject / unlist), customers, owners, bookings; **Style Finder catalogue** (upload style photos, add/hide styles) |

Frontend conventions:

- **Mobile-first.** Design for ~390px, then widen at `sm:`. A bottom tab bar
  (`MobileTabBar`) is shown below `sm`; primary actions get a sticky bottom
  bar.
- **Page containers must be `mx-auto w-full max-w-… px-4`.** The `<main>`
  wrapper is a vertical flexbox, and without `w-full` a centred container
  sizes to its widest content (e.g. the scrollable date-chip row) and pushes
  the page wider than the phone. That was the "page opens zoomed in" bug on
  the booking page.
- **Colours** come from CSS variables in `globals.css` (`bg-brand`,
  `text-accent`, `border-border`, `text-muted`…). Don't hard-code
  greys/blacks, and don't add a bare `prefers-color-scheme: dark` rule
  (Tailwind v4 layering makes it override utilities; see `CLAUDE.md`).
- **Form inputs are forced to 16px** (in `globals.css`) so iOS doesn't zoom
  in when an input is tapped.
- **Times** go through `formatTime()` / `formatHhmm()` in `lib/image.ts`
  (pinned to Asia/Kolkata). Dates for the API use `localDateIso()`, not
  `toISOString()` (which gives yesterday's date before 5:30 AM IST).
- Plain `<img>` tags, not `next/image`.
- **Post-login routing is by role**: customer → `/account`, owner →
  `/owner`, admin → `/admin`. `Nav`, `MobileTabBar` and the page guards all
  follow it; update all of them when adding a role-specific page.

---

## 9. API reference (all under `/api`)

🔓 = public, otherwise a `Bearer` JWT is required (role shown).

| Method & path | Who | Purpose |
|---|---|---|
| `POST /auth/otp/send` | 🔓 | Send OTP `{phone}` (3 per 10 min; returns `devOtp` in dev) |
| `POST /auth/otp/verify` | 🔓 | `{phone, code, name?, role?}` → `{accessToken, user}` |
| `GET /users/me` · `PATCH /users/me` | any | Profile; update `name`, `email`, `avatarUrl` (null removes it) |
| `GET /search/businesses` | 🔓 | `lat, lng, radiusKm, category, q, openNow, minRating, page, limit` |
| `GET /businesses/:id` | 🔓 | Verified salon detail (+ `openNow`, `todayHours`) |
| `GET /businesses/:id/availability` | 🔓 | `serviceId, date (YYYY-MM-DD), staffId?` → `{closed, hours, grid[], slots[]}` |
| `GET /businesses/:id/reviews` | 🔓 | Reviews |
| `GET /cities` · `GET /categories` | 🔓 | Catalog |
| `GET /styles?gender=MEN\|WOMEN` | 🔓 | Style Finder catalogue (active styles) |
| `GET /admin/styles` · `POST /admin/styles` · `PATCH /admin/styles/:id` | admin | Manage styles (`imageUrl`, `active`, `faceShapeFit`, …) |
| `POST /bookings` | customer | Create `{businessId, serviceId, staffId?, slotStart, paymentMethod:'PAY_AT_SHOP'}` → returns `otp` |
| `GET /bookings/me` | customer | My bookings (with `confirmationCode`, `addOns`, `totalAmount`, `review {rating, text}` once reviewed) |
| `POST /bookings/:id/add-services` | customer | `{serviceIds[]}` |
| `POST /bookings/:id/reschedule` | customer | `{slotStart, staffId?}` |
| `POST /bookings/:id/cancel` | customer / owner | `{reason?}` |
| `POST /bookings/:id/start` | owner | Check-in → `IN_PROGRESS` |
| `POST /bookings/:id/complete` | owner / staff | `{otp}` (the customer's code) |
| `PATCH /bookings/:id/no-show` | owner | `{reasonCode}` |
| `POST /bookings/:id/call` | customer / owner | Masked call (503 until Exotel is configured) |
| `POST /reviews` | customer | Review a completed booking |
| `GET/POST /owner/businesses` | owner | List / create my salon |
| `GET/PATCH /owner/businesses/:id` | owner | Full detail (any status) / update (incl. `lat`, `lng`, `address`, `workingHours`, `lastBookingCutoffMinutes`) |
| `GET /owner/businesses/:id/dashboard` | owner | Today's bookings (+ `lateNoShowCandidate`), revenue, cancellations |
| `POST /owner/businesses/:id/services` · `PATCH …/services/:serviceId` | owner | Services (incl. `imageUrl`, `active`) |
| `POST /owner/businesses/:id/staff` · `PATCH …/staff/:staffId` | owner | Staff |
| `POST /owner/businesses/:id/media` · `DELETE …/media/:mediaId` | owner | Salon photos (URL or uploaded data URL) |
| `GET /admin/stats` | admin | Tile counts |
| `GET /admin/businesses?status=PENDING\|VERIFIED\|REJECTED` | admin | Salons by status |
| `POST /admin/businesses/:id/verify` | admin | `{decision:'VERIFIED'\|'REJECTED', reason?}` |
| `GET /admin/users?role=CUSTOMER\|OWNER` · `GET /admin/bookings` | admin | Lists (latest 200) |
| `POST /admin/cities` · `POST /admin/categories` · `GET /admin/reviews/flagged` | admin | Catalog / moderation |
| `POST /webhooks/razorpay` | 🔓 (signature-checked) | Payment webhook |
| `GET /health` | 🔓 | Health check |

---

## 10. Data model (main tables — full schema in `database/prisma/schema.prisma`)

| Table | Key fields | Notes |
|---|---|---|
| `users` | `role` (CUSTOMER/OWNER/STAFF/ADMIN), `phone`, `avatarUrl` | Role fixed at first sign-up |
| `customer_profiles` | `reliabilityScore`, `noShowCountRolling`, `requiresPrepayment` | |
| `businesses` | `workingHours` (JSON), `lat`, `lng`, `address`, `verificationStatus`, `lastBookingCutoffMinutes`, `cancellationPolicy` | Only `VERIFIED` is public |
| `services` | `price`, `durationMinutes`, `imageUrl`, `active` | |
| `staff` / `staff_availability` / `staff_availability_overrides` | weekly windows, per-date overrides | No windows means salon hours |
| `bookings` | `slotStart`, `slotEnd`, `status`, `otpHash`, `otpCode`, `staffId` | `slotEnd` includes add-ons |
| `booking_add_ons` | `bookingId`, `serviceId`, `price`, `durationMinutes` | Price copied at the time it's added |
| `payments` | `amount`, `status`, `provider` (`cash`/`razorpay`) | Amount grows with add-ons while unpaid |
| `hair_styles` | `name`, `gender`, `faceShapeFit` (JSON), `imageUrl`, `active` | Style Finder catalogue |
| `reviews`, `business_media`, `business_trust_badges`, `waitlist_entries`, `audit_logs`, … | | |

Migrations live in `database/prisma/migrations/` and are applied on Render
by `prisma migrate deploy` during the backend build.

---

## 11. Known gaps (what's not done yet)

| Area | Status | To finish |
|---|---|---|
| SMS OTP delivery | OTP returned in the API response (`devOtp`) | Integrate MSG91/Gupshup in `auth.service.ts`, then set `NODE_ENV=production` |
| Online payment | Disabled end to end | Razorpay order creation in `bookings.service.ts`, then remove `assertPaymentMethodAvailable` and the disabled button |
| Masked calling | Built; **never tested against live Exotel** | Exotel account + 4 env vars; test one real call |
| Notifications (confirmations, reminders, waitlist) | Mostly TODO no-ops | Job queue (BullMQ, PRD §7.2) |
| Image storage | Inline data URLs in Postgres | Cloudinary/S3 |
| Rate limiting | Only OTP routes | `@nestjs/throttler` doesn't support Nest 12 yet |
| Google/email login, home-service bookings, loyalty/referrals/wallet | Not built | V2/V3 per PRD |
| Per-stylist shifts / days off | Data model + scheduling support it, no owner UI | Add a staff-hours editor (all stylists follow salon hours today) |
| Style Finder photos | Free Unsplash starter photos | Replace with own salon photos over time (Admin → Style Finder catalogue) |
| Multi-salon owners | UI uses the owner's first salon | Salon switcher |

Search for `TODO` in `backend/src` to see every stubbed call site.

---

## 12. How to… (common changes)

- **Add an API endpoint:** add a Zod DTO in `modules/<x>/dto/`, a controller
  method with `@Body(new ZodValidationPipe(schema))`, then `@Public()` or
  `@Roles(...)`. Check ownership in the service. Boot the API to check
  dependency injection.
- **Change the database:** edit `database/prisma/schema.prisma` →
  `cd database && npx prisma migrate dev --name <change>` → commit the
  migration folder. On Windows, stop the backend first (it locks the Prisma
  engine file).
- **Change an opening-hours / slot rule:** only in
  `common/scheduling/schedule.ts`, with a test in `schedule.spec.ts`.
- **Add a page:** `frontend/src/app/<route>/page.tsx`; container
  `mx-auto w-full max-w-… px-4`; use `apiFetch` + `getToken()`; follow the
  role-based redirects.
- **Add demo data:** append to the `SALONS` array in `database/prisma/seed.js`.
- **Deploy:** push to `main`. Render rebuilds backend and web, runs
  migrations and the seed.

---

## 13. Change history (summary — details in `PROGRESS.md`)

| Date | Change |
|---|---|
| 2026-11-15 | MVP scaffold: search, salon profile, booking, OTP login, owner setup, admin verification, seeded demo data |
| 2026-11-21 | First Render deploy (Blueprint with web, Redis, seed; Linux lockfile fix; CORS for suffixed URLs) |
| 2026-11-21 | Founder phone-test fixes: IST timezone (slots started at 2:30 PM), salon-hours clipping (closed salons were bookable), 10-min late grace + owner check-in/no-show, busy-colour slots, confirmation code under Upcoming, add-on services, masked calling (Exotel), clickable admin lists, device photo uploads + profile pictures, salon location + map/directions, **Compare salons**; security fix for cross-salon service/staff edits; online payment disabled until live |
| 2026-11-21 | Owner setting "accept bookings until X min before closing" |
| 2026-11-21 | Fixed booking page rendering wider than the phone screen ("opens zoomed in") |
| 2026-11-21 | Hours list in Mon→Sun order (no overflow); owner hours editor with late closing + breaks; search radius picker; "Featured salons in your area" + achievements; **Style Finder** |
| 2026-11-21 | "Near me" location is remembered (cookie) across Home/Search/tab switches |
| 2026-11-21 | Owner Manage buttons no longer share one busy state; call-button feedback is a toast; review form closes with a confirmation and shows the submitted review |
