# Trimly — Project Context for Claude

Read this file first in any new session on this repo. It exists so a fresh
session gets full context from this file alone, without re-scanning the
whole tree. Keep it current: update it whenever architecture, stack, or
conventions change — see "Maintenance policy" at the bottom.

For a chronological log of what's been built and when, see `PROGRESS.md`
(update that one too, per the same policy).

For the full human-readable picture (architecture, business rules, API
reference, data model, deploy, how-tos) see **`docs/DEVELOPER-GUIDE.md`**.
Keep it current too: when a convention, rule, endpoint or gap changes,
update the matching section there as well as here.

## Current status & handoff (updated 2026-11-21, end of day 1)

**Read this section first in a new session.**

- **The tech side of the first release is done and live.** Next sessions are
  expected to be about **business / go-to-market**. Start with
  **`docs/BUSINESS-BRIEF.md`**: what exists, cost (₹0, free tiers), decisions
  already made, open questions, and the pre-launch checklist.
- **Live:** backend `https://trimly-backend-3w0i.onrender.com/api`; web app
  `https://trimly-web-<suffix>.onrender.com` (ask the founder for the exact
  URL). Auto-deploys from GitHub `main` (`shakti20062003/barber-marketplace`).
  The founder has installed it on an Android phone (Chrome "Install app").
- **Render env set by the founder:** `GOOGLE_CLIENT_ID`, `ADMIN_EMAILS`,
  `PHONE_LOGIN=off`. Values are private; never ask for or print them.
  Verified working: Google login, in-app calls between real phones, push.
- **Founder profile:** solo, non-technical founder; writes informal
  Hindi-English; tests on their phone and reports issues casually ("this is
  not fixed"). **Cost-sensitive: no paid services until they say so.**
- **Founder decisions (don't re-propose without being asked):** web-first
  (no native apps yet); Google login (phone OTP off until paid SMS); in-app
  WebRTC calling instead of Exotel; pay-at-shop only until Razorpay; Style
  Finder shows Great/Good/May-not-suit bands, **never percentages**, and no
  paid AI; all hairstyles open to everyone; home service **to be discussed
  before any building**.
- **Known business risks to raise:** Render free Postgres has historically
  expired ~30 days after creation (created ~2026-11-16), so check it; the 12
  demo salons + demo users are fictional seed data still on the live site,
  and the deploy re-runs the seed, so removing them needs a seed change too.
- **How work has been done (keep doing it):** verify fixes for real (API
  scripts, browser checks at phone width) before saying they're done; report
  honestly what couldn't be verified; log every chunk in `PROGRESS.md`; keep
  this file, `docs/DEVELOPER-GUIDE.md` and `docs/BUSINESS-BRIEF.md` current.

## What this is

Trimly is a two-sided marketplace for booking barbers, salons, beauty
parlours and grooming services (India-focused, UPI/Razorpay, SMS-first
notifications). Full product spec, personas, user journeys, functional
requirements, NFRs, and the intended architecture are in
`docs/Trimly-PRD-SRS-v1 updated.md` — that document is the source of truth
for *what* to build and *why*; this file is about *how the repo is actually
built* right now. When in doubt about a product decision, read the PRD
first, not this file.

The PRD itself calls for **web first, MVP** — native mobile is explicitly
deferred to V2 ("don't build two native apps before validating the web
funnel"). The user confirmed this direction at project start.

## Repo layout (npm workspaces monorepo)

```
frontend/     Next.js 16 app (customer + owner web UI)
backend/      NestJS 12 API
database/     Prisma schema + seed script — a workspace package the
              backend depends on (see "Prisma client sharing" below)
docs/         PRD/SRS (source of truth for product requirements)
api/          reserved for an OpenAPI spec — not yet populated
design/       reserved for design assets — not yet populated
docker-compose.yml   local Postgres 16 + Redis 7
CLAUDE.md     this file
PROGRESS.md   chronological build log
README.md     setup/run instructions for a human (or agent) working the repo
```

Root `package.json` defines the npm workspaces (`frontend`, `backend`,
`database`) and convenience scripts: `dev:web`, `dev:api`, `build:web`,
`build:api`, `prisma:generate`, `prisma:migrate`, `prisma:studio`.

## Tech stack, and the version pins that matter

Everything below was scaffolded with the *latest* available packages at the
time (Sept 2026), several of which turned out to have real breaking changes
from what's commonly assumed. Don't casually bump these without re-reading
their docs — some were deliberately pinned *down* from "latest" after
hitting problems:

- **Node 20.20.0, npm 10** (no pnpm/yarn). Several transitive deps warn
  `EBADENGINE` wanting Node 22 — harmless so far, everything still installs
  and runs. If something starts actually failing, that's the first thing
  to check.
- **Next.js 16.4.6** (frontend; upgraded from 16.3.4 for a security advisory) — genuinely different from Next 15 in
  places. It ships its own docs at
  `frontend/node_modules/next/dist/docs/` and a repo `frontend/AGENTS.md`
  that says to read them before writing App Router code — do that for
  anything nontrivial. Notable: `PageProps<'/route'>` /
  `LayoutProps<'/route'>` are globally-generated typed-route helpers now
  (used throughout `frontend/src/app/**/page.tsx`), generated by
  `next dev`/`next build`/`next typegen`. No Cache Components /
  `dynamicIO` mode enabled — plain `fetch`/SSR semantics apply.
- **NestJS 12** (backend) — very fresh; the wider Nest ecosystem hasn't
  fully caught up. `@nestjs/throttler` doesn't yet support Nest 12 as of
  this writing — it's **not installed**; rate limiting is not yet wired up
  server-side (see "Known gaps" below; OTP send/verify has its own
  hand-rolled Redis-based rate limiting regardless). Before adding any
  `@nestjs/*` ecosystem package, check its peer-dep range supports
  `^12.0.0` first — several don't yet. `@nestjs/schedule` (added 2026-11-22
  for pre-visit booking reminders) does: `^12.0.4` lists `@nestjs/core`
  `^11.0.0 || ^12.0.0` as a peer dep.
  - Uses **vitest** (not jest) and **oxlint** (not eslint) — that's the
    Nest 12 CLI default now. `npm run test` / `npm run lint` in `backend/`
    use these.
  - `backend/package.json` has `"type": "module"` with
    `moduleResolution: nodenext`. **Every relative import needs an
    explicit `.js` extension** even though the source is `.ts` (e.g.
    `import { PrismaService } from './prisma.service.js'`). This is
    enforced by the TS config, not a style choice — get it wrong and it
    won't compile.
- **Prisma pinned to 6.19.3** (`database/` and `backend/`) — deliberately
  *not* the newest. `prisma@latest` resolves to an `8.0.0-rc` prerelease
  with a totally different CLI (`prisma orm`, `prisma migration`, a cloud
  "Developer Platform" surface, no `generate`/`migrate dev`/`studio`
  subcommands). Prisma 7 also removed `datasource { url = env(...) }` in
  favor of driver adapters + `prisma.config.ts`. Both are real, current
  Prisma directions, just not what this schema is written for — 6.19.3 is
  the last version using the classic config style the rest of the
  ecosystem (and this schema) assumes. Don't bump past 6.x without
  deliberately migrating the config style first.
- **ioredis** — import as `import { Redis } from 'ioredis'` (named), not
  `import Redis from 'ioredis'` (default) — the default-import form breaks
  type-checking under this TS/module config.

## Prisma client sharing across workspaces

npm workspaces here do **not** hoist `@prisma/client` to a single shared
`node_modules` location — `database/` and `backend/` each got their own
copy on install, and `prisma generate` only populates the one it's run
against. Fix in place: `database/index.js` + `database/index.d.ts`
re-export `@prisma/client` wholesale, and `backend/package.json` depends on
the **`database` workspace package itself** (`"database": "^1.0.0"`) rather
than declaring its own `@prisma/client` dependency. Backend code imports
Prisma types/client via `from 'database'`, e.g.
`backend/src/prisma/prisma.service.ts`. Whenever the schema changes, run
`npx prisma generate` from `database/` — that regenerates the copy backend
actually resolves through the workspace symlink.

## Backend architecture conventions

- **Auth**: **Sign in with Google** is the main login (`POST /auth/google`,
  ID token verified in `modules/auth/google-id-token.ts` with Node crypto;
  needs `GOOGLE_CLIENT_ID`). Phone OTP is test-only: no SMS exists, so the
  code is shown on screen. **`PHONE_LOGIN=off` must be set in production**
  once Google works, or anyone can log in as any number. Uniqueness:
  `users.googleSub`, `phone` and `email` are unique; `PATCH /users/me`
  returns 409 on a taken number; `POST /auth/google/link` attaches Google to an
  existing account. Admin via linking or `ADMIN_EMAILS`. OTP hashed (sha256) in Redis, 5 min TTL,
  max 5 verify attempts, 3 sends/10min rate limit — all in
  `backend/src/modules/auth/auth.service.ts`. Role is fixed at
  first-account-creation only, never mutable after (FR-1.2).
- **RBAC**: `JwtAuthGuard` + `RolesGuard` are registered globally in
  `app.module.ts` (`APP_GUARD`) — every endpoint requires a valid JWT by
  default. Opt out per-route with `@Public()`
  (`common/decorators/public.decorator.ts`); restrict to specific roles
  with `@Roles('OWNER', ...)` (`common/decorators/roles.decorator.ts`).
  Getting a new endpoint's access wrong almost always means forgetting one
  of these two decorators, not a guard bug.
- **Validation**: Zod schemas per-DTO (`*/dto/*.dto.ts`), applied via
  `ZodValidationPipe` (`common/pipes/zod-validation.pipe.ts`) — this was an
  explicit PRD requirement ("schema-based, e.g. Zod on the boundary"), not
  the more common NestJS `class-validator` approach. Stay consistent with
  Zod for new endpoints.
  - **Always bind it to the specific parameter — `@Body(new
    ZodValidationPipe(schema)) dto: Dto` or `@Query(new
    ZodValidationPipe(schema)) query: Dto` — never as a method-level
    `@UsePipes(new ZodValidationPipe(schema))`.** A method-level
    `@UsePipes()` runs the pipe against *every* parameter of the handler,
    not just the one it's meant for. Every controller had this bug until
    2026-11-15: any handler combining `@Body()` with `@CurrentUser()` and/or
    `@Param()` (i.e. almost everything except the two auth OTP routes,
    which happen to take a single `@Body()` param each) validated the
    wrong value — the JWT user object or a route `:id` string — against
    the DTO schema and always failed. This had gone uncaught because the
    backend had never been exercised with real HTTP requests against a
    live DB before that date (see "Local dev"). If a new endpoint's
    requests fail validation with every field reported "Required" (or
    "Expected object, received string") despite a correct request body,
    suspect this exact pattern first.
- **Errors**: single global `HttpExceptionFilter`
  (`common/filters/http-exception.filter.ts`) producing one consistent
  `{ error: { statusCode, message, details, path, timestamp } }` envelope
  — also a PRD requirement.
- **Redis usage**: `RedisModule` is `@Global()` and exports both the raw
  client (`REDIS_CLIENT` token) and `SlotLockService`. **`SlotLockService`
  must stay registered/exported from `RedisModule`, not `AppModule`** — it
  was briefly in `AppModule` without being exported, which broke DI for
  every module that injects it (`BookingsModule` couldn't resolve it).
  Caught via a real boot smoke-test (`node dist/main.js`), not just
  `tsc --noEmit` — the DI graph only gets validated at runtime. If you add
  a new cross-cutting provider, prefer putting it in an existing `@Global`
  module and exporting it there rather than in `AppModule`.
- **Circular imports**: `redis.module.ts` and `slot-lock.service.ts` used
  to import each other directly (for the `REDIS_CLIENT` token), which
  breaks under ESM's stricter TDZ semantics (`ReferenceError: Cannot
  access 'REDIS_CLIENT' before initialization` — this only surfaces at
  runtime, `tsc` doesn't catch it). Fixed by extracting the token to its
  own file, `common/redis/redis.constants.ts`, that both import from. If
  you see a "cannot access X before initialization" error in compiled
  output, suspect a two-file circular import and break it the same way.
- **Slot-hold locking** (`common/redis/slot-lock.service.ts`): short-TTL
  Redis lock on `(businessId, staffId, slotStart)` during booking
  creation/reschedule, per PRD §7.3. Token-based release (only the holder
  can release, via a Lua script) to avoid the classic distributed-lock bug
  of releasing a lock someone else has since acquired.
- **Search ranking** (`modules/businesses/businesses.service.ts`): bounding
  box pre-filter in Postgres + exact Haversine distance and weighted
  scoring (distance/rating/availability) done in application code — *not*
  PostGIS. This is deliberate per ADR-003 in the PRD (PostGIS only once
  salon density/query complexity actually requires it). Ranking weights
  are env-configurable (`SEARCH_WEIGHT_DISTANCE/RATING/AVAILABILITY`), per
  an explicit PRD AC that they must not be hardcoded.
- **Timezone + scheduling rules** (`common/scheduling/schedule.ts`, added
  2026-11-21): salon working hours (`"09:00"`) are local wall-clock times,
  so the API process must run in IST. `main.ts` sets `process.env.TZ ||=
  'Asia/Kolkata'` and `render.yaml` pins `TZ` too. Render runs in UTC by
  default, which shipped a real bug: slots started at 2:30 PM. All "is it
  bookable / is it open" logic lives in this one module, shared by the
  availability grid and booking creation so they can't disagree:
  - staff windows are always clipped to the salon's hours for that day; a
    salon closed that day has no slots (it used to stay bookable while
    showing "Closed");
  - staff with no `StaffAvailability` rows (anyone added from the owner UI)
    default to the salon's full hours;
  - start times are offered every 15 min (`SLOT_STEP_MINUTES`);
  - **breaks + editable hours** (2026-11-21): `workingHours[day].breaks`
    (e.g. lunch) split the day via `breaksFor`/`subtractBreaks`; services must
    finish before a break even with a cut-off. Owners edit hours in Manage →
    Opening hours (any time up to 23:59). No per-stylist shift UI exists, so
    stylists follow salon hours (seeded 09–20 shifts removed by migration
    `remove_seeded_staff_shifts`). Show hours with `HoursList` (Mon→Sun):
    JSONB doesn't keep key order;
  - **last booking time** (`fitsWindow`, `Business.lastBookingCutoffMinutes`,
    owner setting under Manage → "Last booking time"): `null` (default) means
    the whole service must finish by closing (9–7 salon, 60-min service → last
    start 6 PM). If set to X (0–240), a booking may start up to X min before
    closing (or the end of the stylist's shift), whatever its length, and may
    run past closing;
  - **10-min late grace** (`LATE_GRACE_MINUTES`): a `CONFIRMED` booking not
    checked in (`POST /bookings/:id/start` → `IN_PROGRESS`) within 10 min of
    its start stops blocking the slot. The status is never changed
    automatically (PRD §4.5); the owner dashboard flags it
    (`lateNoShowCandidate`) and offers mark no-show or cancel. Owners must
    tap "Customer arrived" or the slot gets re-offered.
  - Postgres `@db.Date` columns (staff overrides, waitlist dates) must be
    queried with `dbDateFor(localDay)`, not local midnight. Local midnight
    in IST is the previous day in UTC.
  `GET /businesses/:id/availability` returns `grid` (per start time:
  `available`/`total` stylists + free `staffIds`) used for the booking
  page's green/amber/full colour coding, plus `closed` and legacy `slots`.
- **Booking state machine** (`modules/bookings/bookings.service.ts`)
  implements the full PRD §4 flow: create (with slot lock + reliability-based
  forced-prepayment), cancel (with §4.3 cancellation-policy refund calc +
  §4.6 waitlist notify-on-cancel), reschedule (atomic old-slot-release +
  new-slot-hold), complete (OTP-verified), no-show (owner-supplied reason
  code only, never system-automated, per §4.5 AC — and reliability score /
  rolling no-show count are recomputed from a genuine 90-day trailing
  window per ADR-005, not a monotonically incrementing counter).
  `GET /bookings/me` (`findForCustomer`) lists the calling customer's own
  bookings, newest-first, with the business/service/staff fields and a
  `hasReview` flag the account page needs — added 2026-11-15, there was no
  "my bookings" listing endpoint before that. Since 2026-11-21 it also returns
  `confirmationCode` (from `Booking.otpCode`, stored alongside `otpHash`;
  only ever returned to the booking's own customer, never in owner payloads),
  `addOns` and `totalAmount`.
  - **Add-on services**: `POST /bookings/:id/add-services` (customer, before
    the start time) adds `BookingAddOn` rows, extends `slotEnd` (only if the
    same stylist is still free) and increments the unpaid payment amount.
  - **Masked calling**: `POST /bookings/:id/call` (customer or owner, active
    bookings) goes through `CallBridgeService` (Exotel "connect two
    numbers"; the ExoPhone is the caller ID both ways). Needs `EXOTEL_SID`,
    `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN` and `EXOTEL_CALLER_ID`; without
    them it returns a friendly 503 rather than ever exposing a number. The
    owner dashboard deliberately no longer includes customer phone numbers.
  - **PAY_NOW is rejected** (`assertPaymentMethodAvailable`) and the UI
    shows "Pay online — coming soon", because Razorpay order creation is
    still a stub and a PAY_NOW booking would sit PENDING holding the slot.
    Remove both once payments are live.
  - **Pre-visit reminder push** (added 2026-11-22, FR-10.1: T-24h, T-1h —
    "your appointment is coming up", like a calendar reminder):
    `BookingRemindersService` (`modules/bookings/booking-reminders.service.ts`)
    polls every 5 min (`@Cron(EVERY_5_MINUTES)`, `ScheduleModule.forRoot()` in
    `app.module.ts`) for `CONFIRMED` bookings whose `slotStart` has entered
    the 24h or 1h lead window and whose `Booking.reminder24hSentAt` /
    `reminder1hSentAt` is still null, pushes to the customer via
    `PushService.notifyUser`, and stamps the field so it never double-sends.
    Deliberately a poll, not BullMQ (PRD §7.2 suggests a job queue) — this
    runs as a single backend instance on Render's free tier, so a
    few-minutes-late reminder is an acceptable trade-off for not running
    Redis-backed workers; revisit if that stops being true.
    `reminderPresetsFor` (`common/scheduling/schedule.ts`) pre-marks a
    reminder sent at booking create/reschedule time if the slot is already
    inside that lead window right then (a same-day booking, or a reschedule
    to something starting soon) — otherwise a same-day booking would fire an
    immediate "24 hours before" reminder instead of correctly having missed
    that moment, the way a calendar app skips a reminder whose trigger time
    already passed when the event was created. Reschedule re-arms both
    fields from the new `slotStart` the same way. Needs `@nestjs/schedule`
    (added as a dependency for this; Nest 12-compatible, no Redis/queue
    needed since it's just in-process `setInterval`-style scheduling).
- **Owner salon setup** (added 2026-11-15): `OwnerBusinessesController` now
  has `GET /owner/businesses/:id` (`BusinessesService.findForOwner`) —
  returns full business detail (services/staff/media) regardless of
  `verificationStatus`, unlike the public `findById` which 404s anything
  not `VERIFIED`. Photos: `addMedia`/`removeMedia` on `BusinessesService` +
  `POST`/`DELETE /owner/businesses/:id/media[/:mediaId]`
  (`dto/media.dto.ts`). There's no file upload — owners paste an image URL
  directly or upload from the device. **Uploads are stored inline as
  `data:image/jpeg;base64,...` URLs** (resized client-side to ≤1280px by
  `frontend/src/lib/image.ts`, validated by
  `common/validation/image-url.ts`, max ~1.5 MB; the JSON body limit is
  raised to 3 MB in `main.ts`). The same applies to `Service.imageUrl` and
  `User.avatarUrl` (profile picture, `PATCH /users/me`). This is a stopgap
  because no object storage is configured. Once Cloudinary/S3 exists,
  upload there and store only the URL. `Business.address` + lat/lng are
  editable from the owner's Manage → Location (geolocation or a pasted
  Google Maps link). Customers see an OpenStreetMap embed and a Google Maps
  directions link (no API key needed for either).
  - Owner endpoints for a service/staff member now check it belongs to the
    `:id` business. Previously an owner could edit another salon's
    service/staff by ID.
- **Admin console**: every stat tile on `/admin` is clickable and loads its
  list: `GET /admin/businesses?status=PENDING|VERIFIED|REJECTED`,
  `GET /admin/users?role=CUSTOMER|OWNER` and `GET /admin/bookings` (latest 200).
  Verify/reject now keeps exactly one VERIFIED badge (it used to stack
  duplicates). `AdminService.stats()` (`GET /admin/stats`) gives
  pending/verified/rejected business counts + customer/owner/booking
  counts. `pendingBusinesses()` is enriched with `services`/`staff`/`city`
  (not just `media`) so an admin reviewing a listing can see more than its
  name. `ADMIN` accounts can't self-register — the signup role enum only
  allows `CUSTOMER`/`OWNER` (FR-1.2) — so one is seeded directly in
  `database/prisma/seed.js` (`+919800000099`). Logging in with a phone that
  already has an account ignores whatever role the login form sends
  (role is only read at first-account-creation), so the normal `/login`
  page logs an admin in fine once that phone exists in the DB.

## Frontend conventions

- **Mobile-first, deliberately** — per the PRD, Trimly's real users are
  mobile-only, so every page is designed for a phone viewport first and
  widened at `sm:` rather than the reverse. `components/MobileTabBar.tsx`
  is a fixed bottom tab bar shown only below `sm` (Home / Search / My
  salon if owner / Log in or profile); `components/Nav.tsx` collapses to
  a logo-only bar on mobile and restores the full nav ≥ `sm`. Pages that
  have a primary action (`/salons/[id]`, `/salons/[id]/book`) get a sticky
  bottom CTA bar on mobile instead of relying on scroll-to-bottom buttons.
- **Design tokens live in `src/app/globals.css`** as CSS variables wired
  through Tailwind v4's `@theme inline` (`--brand` orange / `--accent`
  teal / `--surface` / `--border` / `--muted` neutrals) — use the
  `bg-brand`, `text-brand-dark`, `bg-brand-tint`, `bg-accent-tint`,
  `text-accent`, `border-border`, `text-muted`, `bg-surface` utility
  classes these generate rather than raw Tailwind neutral-gray/black
  classes, so the palette stays centrally changeable.
  - **Do not reintroduce a bare `prefers-color-scheme: dark` media query
    on `:root`/`body` in this file.** Tailwind v4 wraps its own utility
    classes in `@layer`, which makes any *unlayered* CSS (a plain `body {
    background: ... }` rule, which is what was here before) win over
    Tailwind utilities like `bg-neutral-50` regardless of specificity.
    That previously caused a real bug: the page rendered half light/half
    dark (white header, black hero) on any OS in dark mode, because no
    component was actually designed with a dark variant — only the
    `:root` variable was flipping underneath them. If dark mode support
    is ever wanted, it needs real `dark:` utility variants added to every
    component, not a variable swap behind their backs.
- **Page containers must be `mx-auto w-full max-w-… px-4`.** `<main>` is a
  vertical flexbox; without `w-full` a centred container sizes to its widest
  content (the booking page's scrollable date-chip row) and makes the page
  wider than the phone, which looked like the page "opening zoomed in"
  (fixed 2026-11-21). To test, render a page in a 390px iframe and compare
  `document.documentElement.scrollWidth` to `clientWidth`.
- **No photo flash on tab switches** — three layers, keep all of them:
  (1) `next.config.ts` `experimental.staleTimes.dynamic = 60` (server pages
  like Home aren't refetched on quick back-and-forth); (2) client-fetched tab
  pages (Styles, Account, owner dashboard, account cards) keep their data in
  `useCachedState(cacheKey(...))` from `lib/clientCache.ts`, an in-memory cache
  keyed per account and wiped by `clearSession()`, so returning renders
  instantly and refreshes quietly; (3) card photos use `components/SmoothImage`
  (shows cached photos before first paint, fades in uncached ones) and
  `cardImageUrl()` (smaller Unsplash sizes). On `/account` both booking lists
  stay mounted and are toggled with `hidden`. Verified: return visits draw
  0 photos invisible and never show "Loading…".
- Images are plain `<img>` tags (with the `@next/next/no-img-element`
  lint rule disabled inline), not `next/image` — consistent with the
  existing `BusinessCard`/salon-profile code, and avoids needing a
  `next.config.ts` `images.remotePatterns` allowlist. Keep doing this for
  new components unless there's a specific reason to switch.
- **Premium home redesign + footer + pricing section** (added 2026-11-28,
  phase 1 of a larger founder ask — home-visit barber booking and real
  membership/payments are separate later phases, not built yet; revised same
  day after founder feedback on the first pass). `components/Footer.tsx`
  renders **only on the home page** (`app/page.tsx`, as the last element),
  not in `layout.tsx` — the founder explicitly wants it on `/` only, not
  every route. The home page's hero/sections use **plain CSS motion, no
  animation library** (`components/Reveal.tsx` — one-shot
  `IntersectionObserver` scroll-reveal; `components/Hero.tsx` —
  scroll-position-driven fade/scale, no `position: fixed`) — keep doing this
  (zero new deps) rather than reaching for `framer-motion`/`gsap`, both
  because this app is mobile-first/bundle-size-conscious and because any new
  npm dependency risks the Linux-native-binary lockfile gotcha above.
  `components/PhotoMarquee.tsx` is a **real horizontally-scrollable
  `overflow-x-auto` strip** (manual touch/trackpad scroll must work — an
  earlier version used `overflow-hidden` + a CSS `transform` keyframe, which
  looked right but made it impossible to scroll manually, per direct founder
  feedback; don't regress to that), that also auto-advances slowly via a
  `requestAnimationFrame` loop nudging `scrollLeft`, pausing on
  pointerdown/touchstart/mouseenter so manual scrolling always wins — needs a
  `label` prop (shown as a heading above it) so it's never unexplained photos.
  New utility classes live in `globals.css` (`.scrollbar-hide` hides the
  scrollbar without disabling scroll, `.shadow-premium`,
  `@media (prefers-reduced-motion: reduce)`), not a new theme file. `Hero`,
  `Reveal`, and `PhotoMarquee` all need `'use client'` — a plain function
  exported from a `'use client'` file (`cardImageUrl` from `SmoothImage.tsx`)
  can be rendered as JSX from a server component but **cannot be called
  directly** from one; `PhotoMarquee` originally omitted `'use client'` and
  crashed at runtime with "Attempted to call cardImageUrl() from the server"
  despite type-checking and linting clean — only showed up once actually run
  against real data in a browser.
  `components/PricingSection.tsx` shows **only one audience's tiers, chosen
  by the viewer's actual role, not a manual toggle** (the founder was
  explicit: a customer shouldn't see salon-owner pricing or vice versa) —
  reads `getStoredUser<CurrentUser>()` the same way `Nav.tsx` does; `OWNER`/
  `STAFF`/`ADMIN` see the salon tiers, everyone else (incl. logged-out
  visitors) sees the customer tiers. Customer tiers (Plus/Pro/Premium) are
  new/illustrative, footnoted "nothing is charged today"; owner tiers reuse
  the real `PlanTier` names + `docs/BUSINESS-BRIEF.md` §5b numbers verbatim.
  Every button is a presentational stub (inline "Launching soon" note, fires
  no request) since no customer membership backend model exists — don't wire
  it to a real endpoint without building that model first.
- **Post-login routing is role-based, not a flat `/`.** Customers land on
  `/account` (profile + booking history, `src/app/account/page.tsx`);
  owners land on `/owner` (salon setup / dashboard, with a link through to
  `/owner/manage` for services/staff/photos); admins land on `/admin`
  (deliberately distinct dark/slate styling, not reusing the light brand
  palette — see "Admin console" above). `/login` redirects by the role
  returned from `/auth/otp/verify` unless an explicit `?next=` was set
  (used by the booking flow to return to where login was triggered from).
  `MobileTabBar.tsx`'s and `Nav.tsx`'s profile links, and `/account`'s own
  role-guard, all follow the same three-way split — if you add a new
  role-gated destination, update all of these, not just one (a
  `MobileTabBar` bug that sent every logged-in user, including customers,
  to `/owner` regardless of role shipped once already).

- **Style Finder** (`/styles`, `lib/faceShape.ts`, `modules/styles`, table
  `hair_styles`): MediaPipe Face Landmarker is loaded **at runtime from the
  CDN** (`import(/* webpackIgnore */ /* turbopackIgnore */ url)`), never
  bundled or npm-installed (lockfile gotcha). The photo never leaves the
  device. Seeded catalogue: 28 styles with per-face-shape scores, upserted
  and never overwritten. Starter photos are free Unsplash images
  (`STYLE_PHOTOS` in the seed, only fills styles with no photo); admins
  replace them in Admin → Style Finder catalogue. **Never show match
  percentages** (founder decision): bands only (Great ≥ 88 / Good ≥ 78 /
  May not suit), and say the final choice is the customer's. No paid AI
  for this feature for now.
- **Security controls** (see DEVELOPER-GUIDE §10b; keep them): push
  endpoints allow-listed (SSRF), **email is never user-editable** (only set
  from Google), Redis rate limiting via `@RateLimit(...)` + global per-IP
  guard (`common/rate-limit`), booking caps (5 upcoming, 2 per salon per day),
  https-only images, security headers in `next.config.ts` / `main.ts`.
  `PUSH_ALLOW_ANY_ENDPOINT=true` is test-only.
- **Web push** (`common/push`, global `PushService`): hand-written with
  Node crypto (VAPID + RFC 8291 aes128gcm, unit-tested against the RFC
  vector). **Don't add the `web-push` npm package** (lockfile gotcha).
  VAPID keys are auto-generated into `app_settings`; don't delete that row.
  Use `push.notifyUser(userId, {title, body, url, tag})`, which is
  fire-and-forget. Owners enable it from the dashboard card; iPhone needs
  "Add to Home Screen". Service worker: `frontend/public/sw.js`.
- **In-app calling** (`modules/calls`, `app/call/[id]`): WebRTC with
  non-trickle offer/answer through Redis-backed endpoints; the callee is rung
  by web push. STUN by default, TURN via env. Two peers on the Windows dev
  machine can't connect (mDNS/NAT loopback), so test media on two real phones.
- **Slots UI**: `components/SlotPicker.tsx` is shared by booking and
  reschedule (crowd levels Free/Busy/Crowded/Full from `available/total`).
- **Achievements** (`modules/businesses/achievements.ts`): computed per
  request from reviews and completed visits, never stored. Earned ones go on
  search cards and the salon page; the full list with progress is on the owner
  dashboard. Home heading is "Featured salons in your area".
- **Search radius**: `trimly_radius` cookie (default 7 km), resolved with
  the location in `lib/location-server.ts`.
- **Compare salons** (`/compare?a=&b=`, entry point `CompareSection` at the
  bottom of the home page): client-side, built from two
  `GET /businesses/:id` calls; ✓ marks the better value per row, and
  services with the same name at both salons are priced side by side.
- Times shown to users go through `formatTime()` in `lib/image.ts`, which
  pins `Asia/Kolkata`. The booking page's default date uses `localDateIso()`,
  not `toISOString()`, which gave yesterday's date before 5:30 AM IST.

## Known gaps / stubbed integrations

TODO-commented at their call sites (search `TODO` in `backend/src`):

- **Online payments**: Razorpay webhook signature verification is real;
  order creation is a placeholder. PAY_NOW is rejected (UI and API) until
  it's live. Pay at shop only.
- **SMS**: none. Phone-OTP login is test-only (code shown on screen) and is
  **off in production** (`PHONE_LOGIN=off`). Profile phone numbers are
  unverified until SMS exists.
- **Calling**: free in-app WebRTC calls are live and work between real phones.
  No TURN relay is configured; add one (env `TURN_*`) if some mobile networks
  fail. Exotel phone-network masking code exists but is unused/unconfigured.
- **Notifications**: owner push alerts (book / change / cancel / add-ons),
  call ringing, and customer pre-visit reminder push (T-24h, T-1h, added
  2026-11-22) are live. Missing: waitlist alerts, SMS fallback, and a
  confirmation push to the customer right after booking (still TODO-commented
  in `bookings.service.ts`'s `create()`).
- **Photos** are stored inline in Postgres as data URLs (no object storage).
- **Not built:** home-service booking (V2, discuss first; schema fields
  reserved), loyalty / referral / wallet (V2/V3), per-stylist shift editor
  (stylists follow salon hours), multi-salon owners (UI uses the first salon),
  email login.
- **Security follow-ups** (accepted for launch, see DEVELOPER-GUIDE §10b):
  Prisma 7 / Zod 4 upgrades for dev-tool audit warnings; JWT in localStorage
  → httpOnly cookies; web CSP.

## Deployment (Render)

`render.yaml` is a Render Blueprint that brings up everything: `trimly-backend`,
`trimly-web`, `trimly-redis` (Key Value, free) and `trimly-db` (Postgres),
all in `singapore`. The backend build runs migrations + the idempotent seed.
Render suffixed both service names (they were taken): the live backend is
`https://trimly-backend-3w0i.onrender.com`, hardcoded as `NEXT_PUBLIC_API_URL`
for the web service (baked in at build time, so redeploy web after changing
it). Backend CORS = `WEB_APP_URL` (comma-separated exact origins) plus
`WEB_APP_URL_PATTERN` (regex, set to match `trimly-web[-suffix].onrender.com`).
`NODE_ENV=development` there on purpose; it's harmless now that
`PHONE_LOGIN=off` blocks OTP. **Don't switch Render's `NODE_ENV` to
`production`**: the build's `npm install` would then skip devDependencies
(Nest CLI, TypeScript) and the build would fail. Free-tier services sleep when
idle, so the first request can take ~1 min. Never set `PUSH_ALLOW_ANY_ENDPOINT`
on Render (test-only; re-opens an SSRF hole).

**Lockfile gotcha:** the root `package-lock.json` must list Linux native
binaries (`lightningcss-linux-x64-gnu`, `@tailwindcss/oxide-linux-x64-gnu`,
`@next/swc-linux-x64-gnu`) or the Render build fails. npm on Windows can
silently prune them. Running `npm install --package-lock-only` here does NOT
fix it (it reuses the installed tree); regenerate by copying the root +
workspace `package.json` files to an empty directory, running
`npm install --package-lock-only` there with no lockfile, and copying the
result back. Check with `grep linux-x64-gnu package-lock.json`.
To **upgrade a package** without churning everything (done for Next 16.4.6):
bump the version in the workspace `package.json`, copy the root + workspace
`package.json` files **and the current lockfile** to an empty directory, run
`npm install --package-lock-only` there, check the Linux binaries are still
listed, copy the lockfile back, then `npm install` locally.

## Local dev

See `README.md` for the actual commands (Docker Compose up, env file
copies, migrate, seed, `npm run dev:api` / `dev:web`). Docker Desktop is
now installed on the dev machine this is normally run on (installed
2026-11-15 via `winget install Docker.DockerDesktop`, WSL2 backend) and
`docker compose up -d` + `npx prisma migrate dev` + `npm run seed` have
been run for real at least once — this is no longer an unverified path.
If you're on a *different* machine without Docker, that first end-to-end
run (Docker up → migrate → seed → both dev servers → click the golden path
in a browser) is still the first thing to do.

Gotcha specific to this Windows setup: in Git Bash, `docker` isn't on
`PATH` by default even once Docker Desktop is installed and running — add
it per-session with
`export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"` before
any `docker compose` command, or its credential helper
(`docker-credential-desktop`) won't be found and image pulls fail.

`database/prisma/seed.js` now seeds 12 fictional dummy salons (not just
the original one) across two city clusters — Mumbai (the app's fallback
coordinates) and Bangalore (a common real geolocation result) — each with
services, staff, trust badges, placeholder photos, and reviews backed by
real dummy *completed bookings* so ratings populate realistically. It's
driven by a `SALONS` array; add more by appending entries there rather
than hand-writing one-off Prisma calls, and keep using
`https://picsum.photos/seed/<slug>/...` for placeholder photos until real
salon photography exists.

## Maintenance policy (follow this from now on, every session)

The user asked for this explicitly — treat it as a standing instruction,
not a one-off:

1. **Before starting any new build work**, update `PROGRESS.md` — log what
   you're about to do so there's a record even if the session ends
   mid-task.
2. **After finishing a chunk of work**, update `PROGRESS.md` with what
   actually got done (append, don't rewrite history), and update this file
   (`CLAUDE.md`) if anything here changed — new stack decisions, new
   conventions, new gaps closed, new gotchas discovered.
3. Keep `docs/DEVELOPER-GUIDE.md` in sync with any change to architecture,
   rules, endpoints, env vars or known gaps.
4. Keep this file a *context briefing*, not a diary — architecture,
   conventions, versions, gotchas, current state. Keep `PROGRESS.md` as the
   *diary* — dated entries of what happened. Don't duplicate the PRD's
   content into this file; reference it instead.
