# Trimly — Developer Guide

**Who this is for:** any developer (or AI assistant) picking up this codebase
cold. Read this first; it explains what the app does, how it is built, how to
run and deploy it, and the rules that are easy to break by accident.

| Document | What it's for |
|---|---|
| **`docs/DEVELOPER-GUIDE.md`** (this file) | The complete picture: architecture, flows, API, conventions, gotchas. |
| `docs/BUSINESS-BRIEF.md` | Business handoff: what's live, costs, founder decisions, open business questions, pre-launch checklist. |
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
| Frontend | **Next.js 16.4.6** (App Router, Turbopack), React 19, Tailwind CSS v4 | Next 16 differs from 15. Read `frontend/node_modules/next/dist/docs/` before nontrivial App Router work. |
| Backend | **NestJS 12** on Node 20 (ESM) | Uses **vitest** and **oxlint** (Nest 12 defaults), not jest/eslint. |
| Database | **PostgreSQL 16** via **Prisma 6.19.3** | Pinned to 6.x on purpose; 7+/8 change the config style. Don't bump casually. |
| Cache / locks | **Redis 7** (ioredis) | OTP storage + rate limits, slot-hold locks. |
| Validation | **Zod** on every request body/query | PRD requirement; not class-validator. |
| Auth | **Sign in with Google** (main) + phone OTP (test mode, switchable off) → JWT | Google ID tokens verified with Node crypto (no SDK). No SMS provider yet. |
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

**Google sign-in** needs `GOOGLE_CLIENT_ID` (see §5). Without it, the login
screen shows phone login only: any phone number works, and the OTP is
returned in the API response (`devOtp`) and shown on screen, because no SMS
provider is connected.

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
| `GOOGLE_CLIENT_ID` | for Google login | OAuth 2.0 **Web application** client id from Google Cloud Console (free). Add the web app's URL (and `http://localhost:3000`) under *Authorized JavaScript origins*. |
| `PHONE_LOGIN` | | `off` disables phone-OTP login. **Set `off` in production once Google works**: without SMS the OTP is shown on screen, so anyone could log in as any number, admin included. Default `on`. |
| `ADMIN_EMAILS` | | Comma-separated Google emails that sign in as (or link to) the admin account |
| `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | optional | TURN relay for in-app calls where direct WebRTC fails (free tiers exist) |
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
- **Crowd levels** (`components/SlotPicker.tsx`, shared by booking and
  rescheduling). `GET /businesses/:id/availability` returns a `grid`: for
  each start time, `available` / `total` stylists and the free `staffIds`.
  Each time is coloured by the share of stylists already booked: **Free**
  (none), **Busy** (< 60%), **Crowded** (≥ 60%, someone still free), **Full**
  (no one free, disabled). With more than one stylist it shows "X of Y free".
  Morning / Afternoon / Evening get a summary (Mostly free < 20% booked,
  Getting busy < 60%, Mostly crowded, Fully booked).

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
- **Change time (reschedule):** customer → "🕐 Change time" in booking
  details (`RescheduleBooking` + `SlotPicker`, current time hidden).
  `POST /bookings/:id/reschedule` keeps the booking's full length (incl.
  add-ons), refuses once the booking has started, and alerts the owner.
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

### 7.2b Notifications (web push) — `backend/src/common/push`

Owners get a phone notification for **new bookings, time changes,
cancellations and added services** (customers get one when the salon cancels).
It's free, standard **Web Push**, implemented with **Node's built-in crypto
only** (`web-push.ts`; no npm package, see the lockfile gotcha):
VAPID (RFC 8292) + aes128gcm payload encryption (RFC 8291). It's unit-tested
against the RFC 8291 worked example (byte-exact) and was end-to-end tested
with a local fake push service that decrypts what we send.

- **Keys:** the VAPID key pair is generated on first use and stored in
  `app_settings` (`vapid_keys`); no env setup. Optional `VAPID_SUBJECT`
  (contact URL) env var. Don't delete that row: it would invalidate every
  existing subscription.
- **Devices:** `push_subscriptions` (endpoint, p256dh, auth, userId). Dead
  endpoints (404/410) are deleted automatically. Every send is logged in
  `notifications_log`.
- **API:** `GET /push/public-key` (public), `POST /push/subscribe`,
  `/push/unsubscribe`, `/push/status`, `/push/test` (sends "alerts are on").
- **Frontend:** `public/sw.js` (service worker: shows the notification,
  opens `/owner` on tap), `lib/push.ts`, `components/BookingAlerts.tsx` (owner
  dashboard card: Turn on alerts / Send a test / Turn off, plus help for
  blocked permission and iPhone). `app/manifest.ts` + icons in `public/`
  make the app installable.
- **iPhone:** Apple only allows web push for sites **added to the Home
  Screen** (iOS 16.4+). The card explains this. Android Chrome works directly.
- **Sending from code:** inject `PushService` (global) and call
  `notifyUser(userId, { title, body, url, tag })`. It's fire-and-forget and
  never throws, so a push problem can't break a booking. `BookingsService.alertOwner()`
  is the booking helper.
- The owner dashboard also lists **Upcoming (next 7 days)**, and bookings
  made in the last 2 hours get a **NEW** badge (`isNew`).

### 7.2c Login and account uniqueness — `modules/auth`

- **Google sign-in (main):** the frontend `GoogleButton` (Google Identity
  Services script) gets an ID token. `POST /auth/google {credential, role}`
  verifies it in `google-id-token.ts`: RS256 signature against Google's JWKS
  (cached per `max-age`), `aud` = our client id, `iss`, `exp`,
  `email_verified`. Unit-tested; uses Node crypto only, no
  google-auth-library. `role` is only used when the account is created.
- **One Google account = one Trimly account:** `users.googleSub` is
  unique. A Google sign-in whose verified email matches an existing account
  links to it instead of creating a duplicate. `POST /auth/google/link`
  (signed in) attaches Google to an existing account, refusing if that
  Google account or email belongs to someone else.
- **One phone number = one Trimly account:** `users.phone` is unique.
  `PATCH /users/me {phone}` normalises Indian numbers to `+91XXXXXXXXXX`
  and returns 409 "already registered with another Trimly account" if
  taken (a race is caught as P2002). Numbers added on the profile are
  `phoneVerified=false` (no SMS yet); OTP-created accounts are verified.
- **Phone OTP** stays for local testing; `PHONE_LOGIN=off` makes both OTP
  endpoints return 403 and hides it on the login screen (`GET /auth/methods`).
- **Admins:** can't self-register. Either link Google to the seeded admin
  (sign in by phone while it's still on → admin console → "Connect
  Google"), or list the Google email in `ADMIN_EMAILS` (links to the seeded
  admin, or creates one).
- `AccountLinks` (account, owner and admin pages): mobile number +
  Connect Google.

### 7.2d In-app calling (free) — `modules/calls`, `app/call/[id]`

WebRTC voice calls between a booking's customer and salon owner. No phone
numbers are involved and no telephony provider is needed.
1. `POST /calls {bookingId}` (either party, active booking) creates a call in
   Redis (2 h TTL) and **rings the other side by web push** ("📞 Incoming
   call from …" → `/call/:id`). It refuses with a clear message if the other
   side has no push device registered.
2. The caller posts an SDP **offer** (ICE gathered up front, non-trickle).
   The callee taps Accept, posts the **answer**, and both poll `GET
   /calls/:id`. Decline, hang-up, a 45 s no-answer timeout and
   "missed call" notices are handled.
3. Audio flows phone-to-phone, encrypted by WebRTC (DTLS-SRTP). ICE uses
   Google STUN, plus optional TURN from env.
- Customers turn on notifications on `/account` (`BookingAlerts
  audience="customer"`) so salons can call them.
- **Tested:** 22-check API run (ringing, offer/answer, decline, missed,
  outsiders blocked, no phone numbers in payloads) and the real UI
  (incoming screen, Decline). **Not verifiable on the dev machine:** actual
  audio between two devices (two peers on one Windows machine can't
  connect: mDNS/NAT loopback). Test with two phones on different networks.
  If some carriers fail to connect, add a TURN relay (env above).
- The Exotel `CallBridgeService` / `POST /bookings/:id/call` remains for a
  possible paid phone-network option later; the UI uses in-app calls.

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
  touches the edge, since a cropped face reads rounder. Two decoders
  (`createImageBitmap` from-image, then `<img>`) plus a blank-image check
  (a decode that yields one flat colour gets "couldn't open this photo",
  not "no face"). Retries: as-is → 25% border → 60% border → 512px + border
  → rotations. **On failure, a "What the scanner saw" panel** shows the exact
  image analysed plus device/browser/file/decoder/size/tries. Ask users to
  screenshot it when a scan fails. Tested: normal,
  phone-style sideways+flag, sideways without flag and tight close-up are all
  detected; a back-of-head photo is rejected.
- **No percentages are shown (founder decision 2026-11-21).** The score is
  only a face-shape lookup, too rough for a precise number, and an exact %
  looked authoritative when it wasn't, which is a trust risk. The UI shows
  bands only: **Great match** (score ≥ 88), **Good match** (≥ 78), **May not
  suit you**, each with a one-line reason, plus "the best style is the one you
  love". The face-shape line says "looks closest to …" without a confidence
  %. Paid AI (stylist analysis or virtual try-on) was discussed and
  **deferred: no paid AI for now.** The prototype proportions in
  `faceShape.ts` are hand-calibrated.
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
| `/styles` | everyone | **Style Finder**: first visit asks "Men / Women / Both" (remembered on the device, `trimly_style_view`); tabs "Men's styles · Women's styles · All" (every style is open to everyone); selfie/upload → face shape → "Does it suit me?" per cut (Great / Good / May not suit, never a %), "Check all", best matches first |
| `/compare?a=&b=` | everyone | Side-by-side comparison; ✓ marks the better value; same-name services priced side by side |
| `/login` | everyone | Customer/Salon owner choice → **Continue with Google**; phone OTP only while `PHONE_LOGIN` is on; redirects by role (or to `?next=`) |
| `/call/[id]` | booking's customer / owner | In-app call screen: incoming (Accept/Decline), ringing, timer, mute, hang up |
| `/account` | customer | Profile + photo, Upcoming / Past bookings. Tap a booking for details: code, add services, call salon, directions, cancel, review |
| `/owner` | owner | First-time salon setup, or the dashboard: **booking alerts card**, today's bookings with Arrived / Complete (code) / No-show / Cancel / Call (refreshed every minute, NEW badges), **Upcoming (next 7 days)**, achievements |
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
| `GET /auth/methods` | 🔓 | `{google: {clientId} \| null, phone: bool}`: what the login screen shows |
| `POST /auth/google` | 🔓 | `{credential, role?}` → `{accessToken, user}` (Google ID token) |
| `POST /auth/google/link` | any | Attach Google to the signed-in account |
| `POST /auth/otp/send` | 🔓 | Send OTP `{phone}` (3 per 10 min; returns `devOtp` in dev; 403 when `PHONE_LOGIN=off`) |
| `POST /auth/otp/verify` | 🔓 | `{phone, code, name?, role?}` → `{accessToken, user}` |
| `GET /users/me` · `PATCH /users/me` | any | Profile (+ `googleLinked`); update `name`, `email`, `avatarUrl`, `phone` (unique, 409 if taken) |
| `POST /calls` · `GET /calls/:id` · `POST /calls/:id/{offer,answer,decline,end}` · `GET /calls/ice-servers` | customer / owner of the booking | In-app calling |
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
| `POST /bookings/:id/reschedule` | customer | `{slotStart, staffId?}` (before the start time only; alerts the owner) |
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
| `GET /push/public-key` | 🔓 | VAPID public key for subscribing |
| `POST /push/subscribe` · `/push/unsubscribe` · `/push/status` · `/push/test` | any | Web-push device management + test notification |
| `POST /webhooks/razorpay` | 🔓 (signature-checked) | Payment webhook |
| `GET /health` | 🔓 | Health check |

---

## 10. Data model (main tables — full schema in `database/prisma/schema.prisma`)

| Table | Key fields | Notes |
|---|---|---|
| `users` | `role`, `phone` (unique), `phoneVerified`, `email` (unique), `googleSub` (unique), `avatarUrl` | Role fixed at first sign-up; one Google account / one phone per user |
| `customer_profiles` | `reliabilityScore`, `noShowCountRolling`, `requiresPrepayment` | |
| `businesses` | `workingHours` (JSON), `lat`, `lng`, `address`, `verificationStatus`, `lastBookingCutoffMinutes`, `cancellationPolicy` | Only `VERIFIED` is public |
| `services` | `price`, `durationMinutes`, `imageUrl`, `active` | |
| `staff` / `staff_availability` / `staff_availability_overrides` | weekly windows, per-date overrides | No windows means salon hours |
| `bookings` | `slotStart`, `slotEnd`, `status`, `otpHash`, `otpCode`, `staffId` | `slotEnd` includes add-ons |
| `booking_add_ons` | `bookingId`, `serviceId`, `price`, `durationMinutes` | Price copied at the time it's added |
| `payments` | `amount`, `status`, `provider` (`cash`/`razorpay`) | Amount grows with add-ons while unpaid |
| `push_subscriptions` | `userId`, `endpoint` (unique), `p256dh`, `auth` | Devices receiving web push |
| `app_settings` | `key`, `value` | Server settings, e.g. generated VAPID keys |
| `hair_styles` | `name`, `gender`, `faceShapeFit` (JSON), `imageUrl`, `active` | Style Finder catalogue |
| `reviews`, `business_media`, `business_trust_badges`, `waitlist_entries`, `audit_logs`, … | | |

Migrations live in `database/prisma/migrations/` and are applied on Render
by `prisma migrate deploy` during the backend build.

---

## 10b. Security (pre-launch review, 2026-11-21)

Controls in place. **Keep them when changing code.**

| Area | Control | Where |
|---|---|---|
| Login | Google ID tokens verified (signature, `aud`, `iss`, `exp`, `email_verified`); phone OTP switched off in production (`PHONE_LOGIN=off`) because there's no SMS (the code would be shown on screen) | `modules/auth` |
| Accounts | Unique Google account / phone / email per user. **Email is only ever set from Google, never typed in.** That prevents pre-claiming a victim's email and capturing their later Google sign-in | `users.controller.ts` |
| Authorisation | Every route needs a JWT unless `@Public()`; roles via `@Roles`; every owner/customer action re-checks ownership (booking, salon, service, staff, call) | guards + services |
| SSRF | Push endpoints must be https on a real push service (FCM, Mozilla, Apple, Windows), checked at subscribe **and** send time. `PUSH_ALLOW_ANY_ENDPOINT=true` is a **test-only** escape hatch; never set it on Render | `common/push/push-endpoint.ts` |
| Abuse | Redis rate limits: 300 req/min per IP globally, plus per-route limits (sign-in, booking, reschedule, completion-code guessing, calls, push tests, uploads, reviews, profile). Fails open if Redis is down | `common/rate-limit` |
| Slot squatting | Max 5 upcoming bookings per customer, max 2 per salon per day | `bookings.service.ts` |
| Input | Zod on every body/query; images must be https or uploaded JPEG/PNG/WebP/GIF data URLs (no `http:`, no SVG, no `javascript:`); size caps; JSON body ≤ 3 MB | `common/validation`, `main.ts` |
| Data exposure | Owners never get customer phone numbers; calls are in-app; `googleSub` never leaves the API; unexpected errors return a generic message | various |
| Payments webhook | HMAC signature verified with timing-safe compare; rejected if the secret is unset | `payments.service.ts` |
| Headers | Web: X-Frame-Options DENY, nosniff, Referrer-Policy, HSTS, Permissions-Policy (mic/camera/location self only). API: same plus `CSP: default-src 'none'`, no X-Powered-By | `next.config.ts`, `main.ts` |
| SQL injection | Prisma only, no raw SQL | — |
| XSS | React escaping; no `dangerouslySetInnerHTML` / `innerHTML` | — |

**Accepted / remaining risks:**
- `npm audit`: 5 "high" left. They're in the Prisma **CLI** tooling
  (`@prisma/config` → `effect`, `deepmerge-ts`; only run during migrations,
  not reachable from requests) and `zod` (memory use on huge constrained
  arrays; mitigated by the 3 MB body cap and `.max()` on every array). The fixes
  need major upgrades (Prisma 7+, Zod 4); plan them deliberately. The Next.js
  critical advisory was fixed by upgrading to **16.4.6**.
- Login token in `localStorage` (7-day JWT): XSS could steal it. React's
  escaping and the absence of HTML injection points make that unlikely;
  moving to httpOnly cookies + CSRF protection is a future hardening step.
- No Content-Security-Policy on the web app yet (Next.js inline scripts need
  nonces); the API has a strict one.
- Rate-limit client IP = `CF-Connecting-IP`, else the right-most
  `X-Forwarded-For` hop (Render/Cloudflare). Can't be verified locally.
- Phone numbers added on the profile are unverified until SMS exists.

## 11. Known gaps (what's not done yet)

| Area | Status | To finish |
|---|---|---|
| SMS OTP delivery | OTP returned in the API response (`devOtp`) | Integrate MSG91/Gupshup in `auth.service.ts`, then set `NODE_ENV=production` |
| Online payment | Disabled end to end | Razorpay order creation in `bookings.service.ts`, then remove `assertPaymentMethodAvailable` and the disabled button |
| Calling | Free in-app WebRTC calls live (signalling tested); real two-phone audio not yet tested | Test on two phones; add TURN if some networks fail. Exotel phone-network masking is still optional/paid |
| SMS | None (phone OTP is test-only) | DLT-registered SMS provider (paid) when affordable; then `PHONE_LOGIN=on` with real SMS and `NODE_ENV=production` |
| Notifications | Owner push alerts (book/change/cancel/add-on) live; customer gets "salon cancelled" | Customer reminders before visits, waitlist alerts, SMS fallback: needs a scheduler / job queue (BullMQ, PRD §7.2) |
| Home-service bookings | Not started (founder wants to discuss first: privacy/safety, stylist-wise pricing, payments) | Schema fields exist (`serviceLocationType`, `HomeServiceArea`) |
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
| 2026-11-21 | **Security review**: SSRF (push endpoints), email pre-claim takeover, rate limiting, anti-squatting, https-only images, security headers, Next 16.4.6; account tabs + tab-switch photo flash fixed |
| 2026-11-21 | **Sign in with Google** (+ phone-login kill switch, unique phone/Google per account, Connect Google); **free in-app calling** (WebRTC rung by push) |
| 2026-11-21 | Style Finder: remembered Men/Women/All view; owner **push notifications** + upcoming list; customer **Change time**; Free/Busy/Crowded/Full crowd levels |
| 2026-11-21 | "Near me" location is remembered (cookie) across Home/Search/tab switches |
| 2026-11-21 | Owner Manage buttons no longer share one busy state; call-button feedback is a toast; review form closes with a confirmation and shows the submitted review |
