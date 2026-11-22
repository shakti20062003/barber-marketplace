# Trimly — Build Progress Log

Chronological record of work done on this repo. Newest entries at the top.
Each session should add an entry *before* starting new work (so there's a
record even if interrupted) and fill it in as work completes. See
`CLAUDE.md` for the "why"/architecture context this log doesn't repeat.

---

## 2026-11-15 (3) — Search fixes, owner salon-management page, admin verification console

**Status: done.** Follow-up to the previous two entries, addressing a batch of
four user-reported issues in one pass:

- **"Open now" filter pill was stretched full-width** — `SearchBar.tsx` had
  `flex-1` on its `<label>`; changed to `shrink-0` so it sizes to its content.
- **Bottom-tab "Search" button did nothing** — it linked to
  `/?focus=search`, a query param nothing read. Replaced with real free-text
  search: added `q` to `searchBusinessesSchema`
  (`backend/.../dto/search-businesses.dto.ts`) and a case-insensitive
  `name` filter in `candidateBusinesses()`
  (`backend/.../businesses.service.ts`); `SearchBar.tsx` now has an actual
  text input + Search button wired to that param, and the mobile tab links
  to `/#search` (anchor-scrolls to the existing `id="search"` section
  instead of a dead param).
- **Owner salon management page** (new `frontend/src/app/owner/manage/page.tsx`,
  linked from `/owner`): lets an owner add/view services, staff, and
  photos for their salon. Backend gained `addMedia`/`removeMedia` on
  `BusinessesService` + a new `dto/media.dto.ts`
  (`{ url: string().url(), type: 'IMAGE'|'VIDEO' }`) + `POST
  /owner/businesses/:id/media` and `DELETE
  /owner/businesses/:id/media/:mediaId` on `OwnerBusinessesController`, plus
  a `findForOwner()` service method + `GET /owner/businesses/:id` endpoint
  (full detail incl. services/staff/media, unlike the public `findById`
  which 404s anything not yet `VERIFIED`). No file upload exists — owners
  paste an image URL (a "try a placeholder" button fills in a picsum.photos
  one). The page shows a verification-status banner explaining that
  customers won't see the salon until an admin verifies it — this gating
  already existed server-side (`verificationStatus` defaults to `PENDING`,
  customer search only returns `VERIFIED`); this page is the first UI that
  surfaces it to the owner.
- **Admin console** (new `frontend/src/app/admin/page.tsx`): deliberately
  distinct dark/slate/monospace styling per the user's explicit request
  ("totally different from the current 2"). Shows live stats
  (pending/verified/rejected business counts, customer/owner/booking
  counts — new `AdminService.stats()` + `GET /admin/stats`) and the
  verification queue (`GET /admin/businesses/pending`, enriched to include
  `services`/`staff`/`city` so an admin can actually judge a listing, not
  just its name) with inline Verify/Reject actions
  (`POST /admin/businesses/:id/verify`, already existed). Also added `GET
  /admin/businesses/verified` (`AdminService.verifiedBusinesses()`) for
  later use, not yet surfaced in the UI.
  - Admin can't self-register (role is restricted to `CUSTOMER`/`OWNER` at
    signup, FR-1.2) — seeded a real admin account directly in
    `database/prisma/seed.js` (`+919800000099`, role `ADMIN`) so there's
    something to log in with. Logging in with an *existing* phone ignores
    whatever role the login form sends (role is only read on first
    creation), so this logs in fine through the normal OTP flow with the
    normal login page.
  - Post-login redirect (`login/page.tsx`) and the `/account` page's
    role-guard now also handle `ADMIN` → `/admin`, alongside the existing
    `OWNER`/`CUSTOMER` split. `MobileTabBar.tsx` and `Nav.tsx` updated the
    same way (both needed it, per the standing note in `CLAUDE.md` about
    that bug shipping once already from only fixing one of the two).
- Verified the whole chain end-to-end with a throwaway owner account +
  business: create → add media/service/staff → confirm it's invisible to
  search while `PENDING` → admin verify → confirm it now appears in
  `q`-filtered search results → deleted the throwaway data afterward.
  (Left alone: a real `Temp 1` business/owner that already existed in the
  dev DB from the user's own manual testing — not mine to delete.)

## 2026-11-15 (2) — Customer account page + a codebase-wide validation-pipe bug fix

**Status: done.** Follow-up session: built the customer account/booking-history
page the user asked for, and in doing so found and fixed a real bug that was
silently breaking almost every mutating endpoint in the backend.

### The bug (now fixed everywhere)

Every controller validated its DTO with method-level `@UsePipes(new
ZodValidationPipe(schema))` above a handler that also had `@CurrentUser()`
and/or `@Param()` parameters. In NestJS, a method-level `@UsePipes()" runs
the pipe against **every** parameter, not just `@Body()`. Zod then validated
things like the JWT user object or a route `:id` string against the booking/
business schema and always failed — so any handler with more than one
parameter was broken. It only happened to work on `auth.controller.ts`'s two
routes because those handlers take a single `@Body()` param and nothing else.
This had never been caught because the backend had never been run against a
live DB with real requests until today's earlier session (build/lint/boot
checks don't exercise request validation).

**Confirmed broken before the fix**: `POST /bookings` (booking creation),
`GET /businesses/:id/availability`, `POST/PATCH` everything in
`owner-businesses.controller.ts` (the entire owner salon-setup flow —
create business, update, add/update service, add/update staff), `POST
/bookings/:id/{cancel,reschedule,complete}`, `PATCH /bookings/:id/no-show`,
`POST /admin/businesses/:id/verify`, `POST /reviews`. Essentially every
write endpoint except OTP send/verify.

**Fix**: moved every `ZodValidationPipe` instance from the method-level
`@UsePipes()` to the specific parameter it validates —
`@Body(new ZodValidationPipe(schema)) dto: Dto` / `@Query(new
ZodValidationPipe(schema)) query: Dto` — and removed the now-unused
`@UsePipes` imports. Applied to every controller, including
`auth.controller.ts` (not currently broken, but the same anti-pattern —
fixed pre-emptively so adding a second param there later can't
reintroduce this). **Convention going forward, now in `CLAUDE.md`: always
bind `ZodValidationPipe` to the specific parameter, never at the method
level.**

Verified via real HTTP requests after the fix (not just compile/lint):
booking creation, availability lookup, booking cancel, and a brand-new
owner signup → create-salon flow all exercised end-to-end successfully.
`npx tsc --noEmit` and `oxlint` both clean on the backend afterward.

### What was built

- **Backend**: added `GET /bookings/me` (`BookingsController.findMine` /
  `BookingsService.findForCustomer`) — there was previously no way for a
  customer to list their own bookings at all, which is what the account
  page needed.
- **Frontend**: new `/account` page (`src/app/account/page.tsx`) — profile
  card with inline name editing (`PATCH /users/me`), reliability score
  display, Upcoming/Past booking tabs, cancel action for upcoming
  bookings, and an inline star-rating review form for completed-but-
  unreviewed bookings (`POST /reviews`).
- Fixed a real routing bug in `MobileTabBar.tsx`: the profile tab sent
  every logged-in user (including customers) to `/owner`, which then
  bounced customers straight back to `/login` since that page gates on
  `role === 'OWNER'`. Now routes by role (`/account` for customers,
  `/owner` for owners).
- `Nav.tsx` gained a "My account" link for customers (desktop nav), to go
  with the existing "My salon" link for owners.
- `/login` now redirects by role after verifying OTP (`/owner` vs
  `/account`) instead of always going to `/`, unless an explicit `?next=`
  was set (e.g. from the booking flow).
- `/owner` dashboard gained a small "Signed in as X / Sign out" header —
  it previously had no sign-out affordance at all.
- `/salons/[id]/book`'s confirmation screen now links to `/account`
  ("View my bookings") in addition to "Back to home".
- Added `MyBooking`/`BookingStatus` types to `lib/types.ts`.

### Not verified

- Still no browser-automation tool in this session — verified entirely via
  direct HTTP requests (curl/node fetch) against the running dev servers,
  plus `tsc`/lint. The user is browsing the live dev server themselves
  during this session (visible in the frontend dev-server log), so this is
  lower-risk than last session's UI pass, but a real visual/mobile check
  is still worth doing.

### Next steps

- Visual QA of the new `/account` page at phone width.
- `git add` + first commit — still not done.

---

## 2026-11-15 — First real end-to-end run + mobile-first UI pass + dummy salon data

**Status: done.** First time this repo has run against a live Postgres/Redis
and been looked at in an actual browser.

### What was done

- **Docker Desktop installed** on this machine (via `winget`) since it
  wasn't present — WSL2 backend, already-existing `wsl --status` showed
  WSL2 was set up. `docker compose up -d` now brings up Postgres 16 +
  Redis 7 as `docker-compose.yml` already specified.
- **First real migrate + seed**: `npx prisma migrate dev --name init` run
  for the first time against a live DB (previously only `prisma validate`
  had been run). Confirmed both `npm run dev:api` (port 4000, `/api/health`
  OK) and `npm run dev:web` (port 3000) boot cleanly end-to-end.
- **Found and fixed a real styling bug**: the user's first screenshot
  showed a broken half-white/half-black page (faint grey logo, unreadable
  hero text). Root cause — `globals.css` had a bare `body { background:
  var(--background) }` rule outside any `@layer`, plus a
  `prefers-color-scheme: dark` media query flipping `--background`/
  `--foreground` to near-black/near-white. In Tailwind v4, utility classes
  are wrapped in `@layer`, so that unlayered `body` rule silently beat
  `bg-neutral-50`/`text-neutral-900` on `<body>` whenever the OS was in
  dark mode — and no component in the app had been designed with a dark
  variant. Fixed by deleting the dark-mode auto-switch entirely and
  defining one deliberate light brand palette as CSS variables in
  `globals.css` (`--brand` orange, `--accent` teal, `--surface`/`--border`/
  `--muted` neutrals) wired through Tailwind v4's `@theme inline`.
- **Mobile-first redesign** (PRD explicitly targets mobile-only users):
  added `components/MobileTabBar.tsx` (fixed bottom nav, hidden ≥ `sm`,
  inline SVG icons, safe-area padding via a `.pb-safe` utility), slimmed
  `Nav.tsx` to a logo-only bar on mobile (full nav restored ≥ `sm`),
  rebuilt `SearchBar.tsx` as horizontally-scrollable category chips plus a
  prominent "Near me" button, redesigned `BusinessCard.tsx` (open/closed
  badge overlay on the photo, colour-coded trust-badge chips, rating
  pill), reworked the home page with a dark hero band + search, reworked
  `/salons/[id]` with a horizontal-scroll photo strip on mobile and a
  sticky bottom "Book now" bar, bumped touch targets and added a sticky
  confirm button on `/salons/[id]/book`, and gave `/login` and `/owner`
  the same brand/touch-target treatment for consistency.
- **Dummy salon data**: `database/prisma/seed.js` rewritten from
  one-salon-only to a 12-salon catalogue across two city clusters (Mumbai —
  matching the app's fallback coordinates — and Bangalore, matching the
  real geolocation in the user's first screenshot), covering all four
  categories, each with services, staff + weekly availability, trust
  badges, placeholder photos (`picsum.photos` seeded URLs — not real salon
  photography), and reviews backed by genuine dummy *completed bookings*
  (not just bare `Review` rows) so ratings/review counts populate exactly
  the way a real booking would produce them. The original hand-made "Style
  Studio Unisex Salon" business was deleted and recreated via the same
  array so it carries reviews/media too.
- Verified via: `GET /api/search/businesses` for both city centers (6 and
  5 results respectively), `curl` 200s on `/`, `/salons/[id]`, and a clean
  Turbopack compile with no errors in the dev-server log.

### Not verified

- No browser-automation tool was available in this session, so the
  redesign was **not** visually confirmed in an actual browser — only via
  API responses, HTTP status codes, and the dev-server compile log.
  Whoever picks this up next (or the user, right after this) should open
  `http://localhost:3000` and sanity-check the mobile layout at a real
  phone width before trusting it further.

### Next steps

- Visual QA pass in a real/emulated mobile browser.
- `git add` + first commit — still not done, same as last session.

---

## 2026-09-09 — Initial monorepo scaffold (web MVP)

**Status: done.** Full project skeleton stood up from an empty repo (only
`docs/` had content — the PRD). User chose web-first (per the PRD's own
recommendation) and a full skeleton rather than a single vertical slice.

### What was built

- **Repo/tooling**: git initialized; npm workspaces monorepo
  (`frontend`, `backend`, `database`); root `package.json` with convenience
  scripts; root `.gitignore` (verified `.env*` and `node_modules` are
  correctly excluded); `docker-compose.yml` for local Postgres 16 + Redis 7.
- **`database/`**: Prisma schema (`prisma/schema.prisma`) implementing the
  full data model from PRD §8 — all entities (users, businesses, staff,
  bookings, payments, reviews, coupons, subscriptions, waitlist, loyalty
  ledger, referrals, audit log, home-service-reserved fields, etc.), enums,
  and the indexing priorities called out in the PRD. Pinned to Prisma
  6.19.3 after discovering `latest` resolves to an incompatible 8.0.0-rc
  (see `CLAUDE.md`). Seed script (`prisma/seed.js`) creates one city, one
  verified demo salon with services/staff/availability, one owner and one
  customer user.
- **`backend/`** (NestJS 12): scaffolded via `@nestjs/cli`, then built out:
  - Config: Zod-validated env schema (fails fast on bad config), including
    configurable search-ranking weights per an explicit PRD AC.
  - Prisma integration via the `database` workspace package (see
    `CLAUDE.md` for why a direct `@prisma/client` dependency doesn't work
    across these workspaces).
  - Redis integration (`RedisModule`, global) + `SlotLockService`
    implementing the §7.3 short-TTL slot-hold lock with token-based safe
    release.
  - Auth module: phone-OTP send/verify, hashed+rate-limited+attempt-capped
    per FR-1.1's explicit ACs, JWT issuance, role fixed at first signup.
  - Common infra: `JwtAuthGuard` + `RolesGuard` (global, opt-out via
    `@Public()`), `ZodValidationPipe`, global `HttpExceptionFilter` for a
    consistent error envelope, `@CurrentUser()` decorator.
  - Businesses module: geo search (bounding-box + Haversine, weighted
    ranking, empty-result filter-relaxation per FR-2.1's AC), public salon
    profile + availability computation (weekly availability minus
    overrides minus existing bookings, sliced by service duration), owner
    CRUD for business/services/staff, owner dashboard (today's
    bookings/revenue/cancellations).
  - Bookings module: full state machine — create (slot lock, "any staff"
    auto-assignment, reliability-based forced prepayment, OTP generation),
    cancel (§4.3 cancellation-policy refund calc, §4.6 waitlist notify),
    reschedule (atomic slot swap), complete (OTP-verified), no-show
    (owner-only, reason-coded, rolling 90-day reliability recompute per
    ADR-005).
  - Reviews module: booking-linked, completed-only, one-per-booking.
  - Admin module: business verification (awards the `VERIFIED` trust
    badge), city/category management, flagged-reviews listing (lightweight
    MVP version).
  - Catalog module: public read-only cities/categories for frontend forms.
  - Payments module: Razorpay webhook with real HMAC signature
    verification (order-creation call itself still a TODO).
  - Users module: `GET/PATCH /users/me`.
  - Verified via `npm run build`, `npm run lint` (oxlint), and a real boot
    smoke-test (`node dist/main.js`) — this caught two real bugs: a
    `SlotLockService` DI-export bug and an ESM circular-import bug between
    `redis.module.ts`/`slot-lock.service.ts` (both documented in
    `CLAUDE.md` so they don't get reintroduced).
- **`frontend/`** (Next.js 16.3.4 — noted as a genuinely breaking-change
  version from what's commonly assumed, see `CLAUDE.md`): scaffolded via
  `create-next-app`, then built out:
  - `lib/api.ts` (typed fetch wrapper + `ApiError`), `lib/types.ts`,
    `lib/auth-client.ts` (localStorage session helpers).
  - `components/Nav.tsx`, `SearchBar.tsx` (geolocation + manual-fallback
    coordinates, category/open-now filters via URL search params),
    `BusinessCard.tsx`.
  - Pages: `/` (SSR search/home, reads `searchParams`), `/salons/[id]`
    (SSR salon profile with `generateMetadata`, per the PRD's SEO NFR),
    `/salons/[id]/book` (client-side booking flow: service → date → slot →
    payment method → confirm, shows the completion OTP on success),
    `/login` (phone-OTP flow), `/owner` (create-salon form when the owner
    has none yet, else today's dashboard).
  - Verified via `npm run build` and `npm run lint` — lint caught 3
    legitimate `react-hooks/set-state-in-effect` flags (new, strict
    React-Compiler-era rule) from syncing client state off `localStorage`
    post-mount to avoid SSR hydration mismatches; resolved with targeted,
    commented disables rather than restructuring, since the pattern is
    correct. Also fixed a `window.location.href` navigation warning by
    switching to `useRouter().push()`.
- **Docs**: root `README.md` (setup/run instructions, stubbed-vs-real
  summary), this file, and `CLAUDE.md`.

### Verified

- `backend`: `npm run build`, `npm run lint`, `npx tsc --noEmit`, and a
  real process boot (DI graph + route mapping confirmed correct; fails
  only on Postgres/Redis connection, which is expected with nothing
  running).
- `frontend`: `npm run build`, `npm run lint` — both clean.
- `database`: `npx prisma validate`, `npx prisma generate` — schema is
  valid and the client generates correctly.
- **Not verified**: no live Postgres/Redis in this environment (no Docker
  available), so no actual end-to-end request has been made against a
  running database. Migration has never been run. This is the first thing
  to do wherever Docker is available.

### Explicitly out of scope this session (see `CLAUDE.md` "Known gaps")

Real Razorpay orders, SMS/WhatsApp delivery, BullMQ job queue, rate
limiting middleware, Google/email auth, home-service booking flow,
loyalty/referral/wallet — all either V2/V3 per the PRD or genuinely need
external credentials/infra this session didn't have.

### Next steps (not started)

- Get Docker running somewhere and do the first real end-to-end pass:
  migrate → seed → run both dev servers → click through the golden path
  (search → salon profile → book → OTP complete) in a browser.
- `git add` + first commit (not yet done — awaiting user confirmation).

## 2026-11-21 — Full Render deploy for v1 phone testing

Goal: get the first release onto a public URL so the founder can use it on
a phone, then click through the full flow in a browser to find bugs.

- `render.yaml` now provisions everything in one Blueprint: `trimly-backend`
  (NestJS), `trimly-web` (Next.js, new), `trimly-redis` (Render Key Value,
  free plan, new — replaces the earlier "bring your own Upstash" note), and
  `trimly-db` (Postgres). The backend build now also runs the idempotent
  seed, so the deployed DB has the 12 demo salons + the seeded admin.
- `backend/src/main.ts`: `WEB_APP_URL` is now a comma-separated list of CORS
  origins (deployed web URL + localhost).
- The deploy is still `NODE_ENV=development` on purpose, so the OTP comes
  back as `devOtp` in the API response (no SMS provider yet).
- Production builds of both apps checked locally before pushing.
- First Render deploy of `trimly-web` failed: `Cannot find module
  '../lightningcss.linux-x64-gnu.node'`. Root `package-lock.json` (generated
  on Windows) only recorded win32 native binaries (npm optional-deps bug).
  Regenerated it from scratch in a clean directory so all platform binaries
  are listed; both builds + backend tests re-verified.
- Render assigned suffixed URLs (`trimly-web.onrender.com` is someone else's
  suspended service). Live backend: `https://trimly-backend-3w0i.onrender.com`
  (verified: `/api/cities` returns seeded data). Web now built against that
  URL; backend CORS gained `WEB_APP_URL_PATTERN` (regex) so the suffixed web
  URL is allowed without knowing it in advance.

## 2026-11-21 — Founder's phone-test bug list (in progress)

Reported after first use on a phone against the Render deploy:
1. Slots showed ~2:30 PM–midnight instead of from opening time (server runs
   in UTC; working hours were interpreted as UTC). Also: slots ignored the
   salon's own working hours entirely (only staff hours), and staff added
   via the owner UI had no availability rows so produced no slots.
2. 10-minute grace: a CONFIRMED booking not started 10 min past its start
   stops blocking the slot; owner can then mark no-show / cancel. "Please
   reach on time" note after booking. BookMyShow-style busy/filling/full
   colour coding of slots during booking.
3. Salon shown "Closed" on home but still bookable.
4. Show the confirmation code on upcoming bookings.
5. Masked calling customer <-> salon (needs a telephony provider; building
   the Exotel integration behind env vars).
6. Add more services to a confirmed booking.
7. Admin console tiles clickable, each opening its list.
8. Owner: upload photos/service images from device, owner profile picture,
   exact map location; customer sees map + directions.
New: compare two salons side by side.

### Done (2026-11-21)

All eight items plus the compare feature are built, along with fixes for
problems found on the way:
- Scheduling rewritten around `common/scheduling/schedule.ts`: IST
  timezone, salon-hours clipping, closed days have no slots, default staff
  hours, 15-min start grid, 10-min late grace, correct `@db.Date` queries.
  The availability `grid` drives green/amber/full slot colours, with a
  per-period trend (Morning/Afternoon/Evening) on the booking page.
- Check-in (`/start`), complete from IN_PROGRESS, and owner dashboard
  actions: arrived, complete with code, no-show/cancel once 10+ min late,
  auto-refresh each minute.
- Confirmation code under Upcoming; expandable booking details with
  add-on services, call salon, and directions.
- Masked calling via Exotel (needs credentials); customer phone numbers
  removed from the owner dashboard payload.
- Admin tiles clickable, each with a searchable list (salons by status,
  customers, owners, bookings); salons can be unlisted or re-verified.
- Device photo upload (salon photos, service photos, profile pictures);
  owner location via GPS or a Google Maps link, plus address; customers get
  a map embed and directions.
- New `/compare` page and a home-page entry point.
- Also fixed: owners could edit other salons' services/staff by ID;
  duplicate VERIFIED badges; PAY_NOW bookings stuck PENDING (online payment
  now disabled until Razorpay is live); new owners got Mumbai coordinates;
  the booking page's default date was the UTC date.
- Verified: backend tsc + oxlint, 11 vitest tests (new
  `schedule.spec.ts`), frontend tsc + eslint + production build, and a
  22-check end-to-end API script against the local DB (customer → owner →
  admin). Not yet done: a visual pass on a real phone, and masked calling
  against a live Exotel account.
- Migration `20261121073150_founder_feedback_fields` (otpCode, address,
  Service.imageUrl, User.avatarUrl, booking_add_ons). Render applies it on
  deploy via `migrate deploy`.

## 2026-11-21 — Owner setting: last booking time before closing (in progress)

Founder asked for an owner setting "accept bookings until X minutes before
closing". Default (unset) keeps the current rule: a service must finish by
closing time (9–7 salon, 60-min service → last start 6:00 PM). When set, the
last start time is closing − X regardless of service length, and the
service may run past closing.
- Done: `Business.lastBookingCutoffMinutes` (migration
  `last_booking_cutoff`), `fitsWindow()` in `common/scheduling` used by both
  the availability grid and booking creation, owner UI under Manage → "Last
  booking time" with a live preview from the salon's own hours. Verified: 4
  new unit tests (15 total), plus a live API run on Style Studio. Default
  last start 6:15 PM for a 45-min service; 30-min setting gives 6:30 PM;
  999 rejected; null restores the default.

## 2026-11-21 — "Booking page opens zoomed in" + developer guide

- Bug: on phones the booking page laid out 448px wide on a ~374px screen,
  so mobile browsers shrank it or let it pan, which looked "zoomed".
  Cause: page container `mx-auto max-w-md` inside the flex-column `<main>`
  sized to its widest content (the date-chip row). Fix: `w-full` on every
  page container (book, owner, manage, compare, login, admin, salon).
  Verified by rendering the pages in a 390px iframe on the production
  build: scrollWidth equals clientWidth on the booking pages (previously
  448 vs 374); home, salon, compare, search, login also OK.
- Added `docs/DEVELOPER-GUIDE.md`: a full handover document for any
  developer or AI (what the app is, stack, repo map, local run, Render
  deploy + env vars, architecture + conventions, scheduling/booking rules,
  page map, API reference, data model, known gaps, how-tos, change
  history). Linked from CLAUDE.md and README.md; the maintenance policy now
  includes keeping it current.

## 2026-11-21 — Owner Manage: buttons sharing one "busy" state

- Bug: on /owner/manage, tapping "Save location" made the "Upload photos"
  button show "Uploading…". Every action shared one `busy` boolean.
  Fix: `busy` is now the specific in-flight action (`'photos' | 'location' |
  'cutoff' | 'service' | 'servicePhoto' | 'staff' | 'photoLink'`), and each
  button checks only its own; "Save location" now shows "Saving…".

## 2026-11-21 — Call button message breaking layout

- Bug: tapping the call icon ("In-app calling is coming soon") rendered the
  message as inline text under the button, which widened the owner
  dashboard booking row (and the customer booking card's action row) and
  squashed the neighbouring content. Fix: `CallButton` now shows feedback
  as a fixed-position toast (above the mobile tab bar, auto-dismiss 4s,
  tap to close) and the button itself has a fixed size (`shrink-0`).

## 2026-11-21 — Review submission had no confirmation

- Bug: after submitting a review the form stayed open with no success
  message, so the customer tapped Submit again and got "This booking has
  already been reviewed" (the first submit had worked). Fix: the form
  closes on success with "✓ Thanks! Your review has been posted."; reviewed
  bookings show "Your review ★★★★☆ + text" (`GET /bookings/me` now returns
  `review {rating, text}`); an "already reviewed" response is treated as
  success. Verified against the local API (submit 201, repeat 400, the
  booking then carries the review).

## 2026-11-21 — "Near me" forgotten after switching tabs

- Bug: "Near me" put coordinates only in the URL; the Home tab links to plain
  `/`, so returning to Home showed Mumbai salons again. Also, tapping a
  category/filter injected Mumbai coordinates into the URL when none were
  present. Fix: "Near me" saves a `trimly_loc` cookie (30 days); Home and
  Search resolve URL → saved cookie → Mumbai fallback server-side
  (`lib/location-server.ts`); SearchBar no longer injects fallback
  coordinates. Home shows "📍 Near your location" or "Showing Mumbai · tap
  Near me". Verified on the production build with cookies: plain `/` and
  `/search` with a saved Bangalore location list Bangalore salons; no or
  invalid cookie → Mumbai; an explicit URL location wins.

## 2026-11-21 — Founder batch 3 (in progress)

1. Salon hours list: Wednesday's "09:00–19:00" overflows; days in random order.
2. Owner-editable working hours per day (incl. late closing, e.g. 11 PM) and
   breaks (e.g. lunch) that customers can't book.
3. Customer-chosen search radius ("salons within 5 / 7 km").
4. Home: "Featured salons in your area" + salon achievements so owners
   feel valued.
5. New "Style Finder" tab: men's + women's haircut catalogue with names;
   customer takes a clear face photo; a "Compare" button shows how well
   each cut suits their face (%).

### Done (founder batch 3, 2026-11-21)

1. Hours list: new `HoursList` (Mon→Sun, one row per day, today
   highlighted, breaks shown). Cause of the shuffled order: Postgres JSONB
   reorders keys.
2. Owner hours editor (open/close per day up to 23:59, closed toggle, up
   to 3 breaks, copy to all days) + backend breaks support in
   `common/scheduling` (+5 tests, 20 total). Found during testing: seeded
   stylist shifts (09–20) capped late-closing salons at 8 PM. The seed no
   longer creates them, and migration `remove_seeded_staff_shifts` deletes
   exactly that seeded pattern.
3. Radius chips (2/5/7/10/15 km, default 7, remembered in a cookie), with
   "Search within N km" when empty.
4. "✨ Featured salons in your area" + computed achievements (cards, salon
   page, owner dashboard with progress bars).
5. Style Finder: `/styles` tab, 28 seeded styles (`hair_styles` table,
   migration `style_finder`), public + admin API, admin photo upload,
   in-browser face-shape analysis (MediaPipe from CDN) with per-style match
   %. Photos are placeholders until an admin uploads licensed images.
- Verified: API script (15 checks: styles, achievements, radius, hours
  validation, lunch excluded from slots, late slots to 22:30); browser on
  the production build: Style Finder analysed a sample portrait (Oval 54%,
  matches 76–91%, sorted), salon hours list, owner achievements, hours
  editor at ~280px width.

## 2026-11-21 — Style Finder polish + starter photos

- Sticky Women's/Men's bar left a 3px see-through gap under the top nav
  (pinned at 56px; the nav is 53px). Now `top-[52px]` with a solid background.
- Home heading shortened to "✨ Featured near you".
- Style photos: founder asked for photos from the internet. Used free
  Unsplash images (Unsplash License allows commercial use without
  permission), hand-picked from Unsplash's free-license search so each photo
  shows its cut, all 28 distinct, all verified to load. Seed `STYLE_PHOTOS`
  fills only styles with no photo (admin uploads are never replaced).

## 2026-11-21 — Style Finder: "couldn't find a face" on a good selfie

- Bug: a clear close-up selfie was rejected. Likely cause: phone photos are
  stored sideways with an EXIF orientation flag; the preview honours it, but
  the raw pixels went to the detector sideways. Close-ups whose face touches
  the frame edges are a second common miss.
- Fix (`lib/faceShape.ts`): decode upright (`createImageBitmap` +
  `imageOrientation: 'from-image'`), downscale to 1024px, retry with padding
  and with 90/270/180° rotations, detector confidence 0.3; a clearer error
  message; a tip when the face is cropped (shape reads rounder).
- Verified in the browser on the production build with generated test
  photos: normal ✓, sideways+EXIF (phone-style) ✓, sideways without EXIF ✓,
  tight close-up ✓ (+ tip), back of head → correctly rejected.

## 2026-11-21 — Style Finder: still "no face" on the founder's phone

- The second fix was live (new error wording) but the founder's selfie still
  failed. Could not reproduce on desktop Chrome: normal, phone-style
  sideways+EXIF, sideways without EXIF and extreme close-ups (face filling or
  overflowing a 3000px frame) all detected. So it's device/browser-specific
  (unknown model; suspect iOS Safari decoding).
- Added: a second decoder (`<img>`) as fallback, a blank-decode check with
  its own message, more retries (60% border, 512px scale), arm's-length
  guidance, and a **"What the scanner saw" diagnostics panel** on failure
  (preview of the analysed image + device/browser/file/decoder/size/tries).
  A failed scan now clears the previous result.
- Next step: get a screenshot of the diagnostics panel from the founder's
  phone to pinpoint the cause.

## 2026-11-21 — Style Finder: drop match percentages

- Founder feedback: the face↔style comparison isn't accurate enough, and
  showing exact percentages is risky. Discussed AI options (vision-model
  stylist about ₹1–3/scan; image-generation try-on about ₹3–10/image);
  founder chose **no paid AI for now**.
- Changed: no % anywhere. Bands only: Great match / Good match / May not
  suit you, each with a reason. Face shape shown as "looks closest to …" (no
  "% sure"). Added "the best style is the one you love; your stylist can help".
  Buttons: "Does it suit me?" / "Check all". Thresholds tightened to 88/78,
  because at 85/75 an oval face got 13 of 14 "Great". Verified in the
  browser: men 5 Great / 8 Good / 1 May not suit; women 7 / 7; zero "%" on
  the page.

## 2026-11-21 — Founder batch 4 (in progress)

1. Style Finder: ask once "Men / Women / Both", remember it, tabs renamed
   to "Men's styles / Women's styles / All" (styles stay open to everyone).
2. Owner gets a notification when a booking comes in: web push + upcoming
   bookings list on the dashboard.
3. Customer can change the slot (reschedule) and sees how crowded each time is
   (Free / Busy / Crowded / Full, based on booked vs. available stylists).
Later (discussion first): home-service bookings.

### Done (founder batch 4, 2026-11-21)

1. Style Finder asks once "Men / Women / Both" (remembered), tabs "Men's
   styles / Women's styles / All". Verified in the browser.
2. Owner notifications: free Web Push built on Node crypto only (no new npm
   deps), auto-generated VAPID keys in `app_settings`, `push_subscriptions`
   table (migration `push_notifications`), service worker, manifest + generated
   icons, dashboard "Turn on alerts / Send a test" card (iPhone guidance),
   alerts on new booking / time change / cancellation / added services, plus
   an "Upcoming (next 7 days)" list and NEW badges. Verified: RFC 8291 test
   vector byte-exact; a 15-check end-to-end run with a local fake push service
   decrypting the real payloads. Not yet verified on a real phone: the founder
   should tap "Turn on alerts" then "Send a test".
3. Change time: shared `SlotPicker` (booking + reschedule) with
   Free/Busy/Crowded/Full and "X of Y free"; reschedule now refused once the
   booking has started; friendlier "slot taken" message. Verified in the
   browser (2-stylist salon: 11:00 Full, 12:00 Busy "1 of 2 free"; moved a
   booking to 3:00 PM via the UI). Fixed the period summary saying "Mostly
   busy" for a mostly-free morning.
- Home service: deferred for discussion (founder's request).

## 2026-11-21 — Free login + free calling (in progress)

Founder can't pay for SMS or telephony yet. Agreed:
1. **Sign in with Google** (free) as the main login. One Google account =
   one Trimly account; one phone number = one account (phone added on the
   profile). Security: the live site shows the OTP on screen (no SMS), so
   anyone can log in as any number, admin included. Phone-OTP login gets
   switched off on production once Google works; the admin signs in with
   Google via an `ADMIN_EMAILS` allow-list.
2. **In-app calling** (free): WebRTC voice calls between customer and
   salon, rung through our push notifications; no phone numbers involved.

### Done (free login + free calling, 2026-11-21)

- Google sign-in: `google-id-token.ts` (RS256/JWKS, aud/iss/exp/email
  checks; 8 unit tests; checked against Google's live keys), `POST
  /auth/google`, `/auth/google/link`, `GET /auth/methods`, `PHONE_LOGIN`
  kill switch, `ADMIN_EMAILS`. Migration `google_login` (`googleSub` unique,
  `phoneVerified`; OTP accounts backfilled as verified). Login page
  rebuilt (role → Google; phone only when enabled). `AccountLinks` card
  (mobile number + Connect Google) on the account, owner and admin pages.
- Uniqueness verified: a customer can't save the owner's number (409); same
  number re-saved keeps verified; invalid numbers rejected; googleSub never
  sent to the browser. With PHONE_LOGIN=off, send/verify return 403 and
  methods report phone:false.
- In-app calling: `modules/calls` + `/call/[id]` + CallButton now starts
  WebRTC calls rung by push; customers can turn on notifications. A 22-check
  API e2e passed; the real UI (incoming screen + Decline) worked. Media between
  two peers can't be tested on this machine (two peers in one Windows browser
  never connect, even with no server: mDNS/NAT loopback). Needs a
  two-phone test.
- Not done (founder must do): create the Google OAuth client id and set
  `GOOGLE_CLIENT_ID` (+ `ADMIN_EMAILS`) on Render; link Google to existing
  phone accounts; then set `PHONE_LOGIN=off`.

## 2026-11-21 — Polish + pre-launch security review (in progress)

Founder confirmed Google login and in-app calls work on real phones.
1. Account page: show the notifications + "Your account" cards only on the
   Upcoming tab.
2. Switching tabs re-loads photos every time (flash) — fix.
3. Security review before publishing — find and fix vulnerabilities.

### Done (polish + security review, 2026-11-21)

- Account page: notifications and "Your account" cards only on Upcoming; both
  lists stay mounted (hidden), so photos don't reload on tab switches.
  Verified: 25 past-booking images were the same DOM nodes across switches.
- Tab-switch flash: `staleTimes.dynamic = 60`. Verified: Home → Styles →
  Home ×2 made 0 new server requests and images were already loaded.
- Security review fixes (each attacked in `security-e2e`, all blocked):
  SSRF via push endpoints (6 attack URLs → 400), email pre-claim takeover
  (email no longer editable), rate limiting (completion-code guessing and
  Google sign-in floods → 429), slot squatting caps (5 upcoming; 2 per salon
  per day), https-only images (http/javascript/SVG rejected), API + web
  security headers, Next 16.3.4 → 16.4.6 (critical advisory; lockfile updated
  in a clean dir from the existing one, 51-line diff, Linux binaries intact).
- Regression: push e2e (15), login+calls e2e (22), original e2e (22) and
  31 unit tests all pass.

## 2026-11-21 — Photo flash on tab switches (second fix)

- Founder: photos still reloaded on every tab switch. The first fix only
  covered Home (server page). Cause: Styles, Account and the owner dashboard
  fetch their data in the browser on every visit, so they started blank
  ("Loading…") and photos popped in again.
- Fix: `lib/clientCache.ts` (`useCachedState`, in-memory, per account, wiped on
  sign-out) for those pages and the account cards; `SmoothImage` (cached photos
  visible before first paint, others fade in) + smaller Unsplash card sizes.
- Verified with a timing-free check (timers are throttled in the automation
  window, so ms timings were unreliable): on return visits Styles (28
  photos), Account and Home drew 0 photos invisible and never showed
  "Loading…".

## 2026-11-21 — End of day 1: handoff

Tech side of the first release is done and live; the founder will move to
business discussions in a new session.
- Added `docs/BUSINESS-BRIEF.md` (what's live, ₹0 cost breakdown and
  free-tier limits, deferred paid items, founder decisions, open business
  questions incl. the PRD §11 revenue model, pre-launch checklist, security
  summary).
- `CLAUDE.md`: new "Current status & handoff" section at the top (live
  URLs, env set on Render, founder profile and decisions, business risks:
  free Postgres expiry, demo seed data on the live site); refreshed "Known
  gaps" (it was stale: still said no Google login, no rate limiting, Exotel
  calling); deployment notes (don't set NODE_ENV=production on Render; the
  package-upgrade lockfile procedure).
- Linked the brief from README and DEVELOPER-GUIDE.

## 2026-11-22 — Customer pre-visit reminder push (FR-10.1: T-24h, T-1h)

Founder asked for reminder push notifications for customers who've booked a
slot — "like Google Calendar" reminders before the appointment. This was
already a named gap in CLAUDE.md's "Known gaps" (needs a scheduler, PRD
§7.2). Plan: add `@nestjs/schedule` (Nest-12-compatible per its peer deps)
and a polling cron, not BullMQ — this app is a single backend instance on
Render free tier, so a few-minutes-late reminder beats running Redis-backed
workers for now.

### Done

- `database/prisma/schema.prisma`: `Booking.reminder24hSentAt` /
  `reminder1hSentAt` (nullable `DateTime`), migration
  `20261122061602_add_booking_reminder_timestamps`, applied locally via
  `prisma migrate dev` against the Docker Postgres and regenerated.
- `common/scheduling/schedule.ts`: `formatSalonTime` (moved out of
  `bookings.service.ts`'s private `when()`, now shared), `REMINDER_24H_LEAD_MS`
  / `REMINDER_1H_LEAD_MS`, and `reminderPresetsFor(slotStart, now)` — pre-marks
  a reminder "sent" at booking create/reschedule time if the slot is already
  inside that lead window right then, so a same-day booking (or a reschedule
  to something starting soon) doesn't fire an immediate, misleadingly-early
  reminder; the cron only ever asks "is it time yet."
- `bookings.service.ts`: wired `reminderPresetsFor` into `create()` and
  `reschedule()` (reschedule re-arms both fields for the new `slotStart`).
- New `modules/bookings/booking-reminders.service.ts`
  (`BookingRemindersService`, `@Cron(EVERY_5_MINUTES)`): queries `CONFIRMED`
  bookings with `slotStart` inside the 24h/1h window and the matching field
  still null, pushes via `PushService.notifyUser`, stamps the field.
  Registered in `BookingsModule`; `ScheduleModule.forRoot()` added to
  `app.module.ts`.
- `backend/package.json`: added `@nestjs/schedule@^12.0.4`. Lockfile
  regenerated via the documented procedure (copy root + workspace
  `package.json` + current lockfile to an empty dir, `npm install
  --package-lock-only` there, checked Linux binaries still listed — 18
  `linux-x64-gnu` occurrences before and after — then copied back).
- Unit tests for `reminderPresetsFor` in `schedule.spec.ts` (3 new cases:
  far-out booking leaves both unset, 2h-out pre-marks only the 24h one,
  30-min-out pre-marks both).

### Verified for real

- `tsc --noEmit`, `oxlint`, unit tests (34/34, was 31) and the `app.e2e-spec`
  boot test (full `AppModule`, confirms `ScheduleModule` + the new provider
  resolve in the DI graph, not just type-check) all pass.
- Built (`nest build`) and booted `dist/main.js` against the local Docker
  Postgres/Redis. Logged in as a fresh test customer (phone OTP) and created
  two real bookings via the HTTP API against seeded salon data: one ~39 min
  out (both `reminder24hSentAt`/`reminder1hSentAt` came back pre-stamped at
  create time — correct, no legitimate "N hours before" moment was left) and
  one 3 days out (both came back null — correct, still pending).
  Then, to test the cron itself without waiting out a real 24h/1h window,
  directly rewound the 3-day booking's `slotStart` to 50 minutes out with
  both fields reset to null (simulating time having passed since a real
  booking's creation) and watched the live, running server: at the next
  5-minute cron tick (`06:25:00` UTC) both fields flipped to non-null with no
  errors in the server log — confirms the scheduler is actually running and
  its query/update logic is correct against the real DB, not just unit-level.
  Test bookings/user deleted afterward; scratch verification scripts were
  temporary (not committed).
