# Trimly — Business Brief & Handoff

**Purpose:** starting point for business / go-to-market discussions. It covers
what exists today, what it costs, what the founder has already decided, and the
open questions. Technical detail lives in `docs/DEVELOPER-GUIDE.md`; product
requirements and the original strategy in `docs/Trimly-PRD-SRS-v1 updated.md`.

_Status as of 2026-11-21 (end of the first build day); revenue-model
discussion added 2026-11-22 (§5a, §5b)._

---

## 1. Where Trimly is today

A **working, live web app** (installable on Android as an app; iPhone via "Add
to Home Screen"), built by a solo founder with Claude in one day. The tech
side of the first release is essentially done.

- **Live backend:** `https://trimly-backend-3w0i.onrender.com/api`
- **Live web app:** `https://trimly-web-<suffix>.onrender.com`. Ask the
  founder for the exact address (Render added a random suffix).
- **Code:** GitHub `shakti20062003/barber-marketplace` (private), auto-deploys
  to Render on every push to `main`.

### What customers can do
Find nearby salons (choose a radius) → compare two salons side by side →
book a time (slots coloured Free / Busy / Crowded / Full) → get a
confirmation code → change the time, add services, cancel → **call the salon
inside the app** (no phone numbers shared) → directions → review.
**Style Finder:** browse 28 cuts (men's + women's), scan your face on the
phone and see Great / Good / May-not-suit matches.

### What salon owners can do
List a salon (goes live after admin verification) → photos, services (with
photos), staff, location, **opening hours with breaks** (e.g. lunch), last
booking time → **phone notifications for new / changed / cancelled bookings**
→ dashboard (today + next 7 days, check-in, complete with code, no-show after
10 min late) → call the customer in-app → **achievements** earned from real
reviews / visits (recognition so owners feel valued).

### What the admin can do
Verify / reject / unlist salons; browse customers, owners, bookings; manage
the Style Finder catalogue (photos, styles).

### Login
**Sign in with Google** only, live. Phone-OTP login is switched off because
there's no SMS provider (see §3). One Google account = one Trimly account;
one phone number = one account.

---

## 2. What it costs right now: ₹0

Everything runs on free tiers or free technology:

| Piece | How it's free | Limit to know about |
|---|---|---|
| Hosting (Render) | Free web services + free Postgres + free Redis | Services **sleep when idle** (first visit takes ~1 min). ⚠️ Render's free Postgres has historically **expired about 30 days after creation**; this one was created ~2026-11-16. **Check the Render dashboard and plan a paid DB (or a backup) before then.** |
| Login | Google sign-in | — |
| Notifications | Web push (browser standard) | iPhone needs Add to Home Screen |
| Calls | In-app WebRTC calls | Both people need internet; some networks may need a TURN relay (free tiers exist) |
| Face scan (Style Finder) | Google MediaPipe, runs on the phone | Match quality is a styling guide, not exact (shown as bands, never %) |
| Style photos | Free Unsplash images | Replace with own salon photos over time |

---

## 3. Paid things deliberately deferred (founder decision: no spending yet)

| Item | Why it matters | Rough cost (verify before buying) |
|---|---|---|
| **SMS OTP** (MSG91 / Gupshup etc.) | Lets people log in with a phone number; India requires DLT registration | Roughly ₹0.15–0.25 per SMS + DLT setup |
| **Online payments** (Razorpay) | "Pay online" is switched off; pay-at-shop only | Razorpay charges a % per transaction (≈2% standard) |
| **Phone-network masked calling** (Exotel) | In-app calling already covers this for free | Per-minute + virtual number rental |
| **Paid hosting** | No sleeping, more reliable, database doesn't expire | Roughly $7/month per service on Render's paid tiers |
| **Paid AI** (stylist analysis / virtual try-on) | Discussed and declined for now | ≈₹1–3 per scan / ₹3–10 per try-on image |

---

## 4. Decisions the founder has already made (don't re-litigate)

- **Web app first** (PRD): no native Play Store / App Store apps yet.
- **No paid services yet**: free tiers / free tech only (SMS, payments, AI deferred).
- **Google sign-in** as the main login; phone login off in production.
- **In-app calling** instead of paid masked calling.
- **Style Finder shows bands (Great / Good / May not suit), never percentages**,
  with "the best style is the one you love". No paid AI for it.
- **Pay at shop only** until Razorpay is set up.
- **Every style is open to everyone** (no gender lock); the app just remembers
  the customer's preferred view.
- Style Finder exists although the PRD listed "AI try-on" as a V1 non-goal.
  It's a free, on-phone, face-shape guide, not a try-on.
- **Home service**: wanted, but **discuss first** (privacy / safety, per-stylist
  pricing, payments) before building anything.

---

## 5. Open business questions for the next discussion

1. **Revenue model.** The PRD (§11) proposes: **commission per booking**
   (suggests starting at 8–12%), **salon subscription tiers** (Free / Premium /
   Featured), later sponsored listings, and **no fee for customers** at MVP.
   Nothing is charged today, and commission can't be collected until online
   payments exist (or salons are invoiced). **Direction proposed on
   2026-11-22 — see §5b below** (flat subscription first, commission later,
   only on marketplace-acquired new customers). Not yet locked in.
2. **Launch city.** The PRD says launch in **one city** (goal: 200+ verified
   salons, 5,000 completed bookings in 90 days). Which city?
3. **Salon onboarding.** The PRD warns most local marketplaces fail on the
   salon side. Plan for **ops-assisted onboarding** (visiting salons, setting
   up their listing / hours / photos with them), not self-serve only.
4. **Home service.** Scope, safety (both sides), pricing (stylist-wise +
   travel), payments. The PRD suggests validating demand first (waitlist).
5. **When to start paying for things.** Order of priority suggested so far:
   database / hosting (avoid the free-tier expiry and sleep), then SMS, then
   payments.
6. **Trust & legal before public launch.** Privacy policy and terms pages
   (the app handles phone numbers, location, and camera on the phone), salon
   agreement (commission, cancellations, no-shows), grievance contact.
7. **Brand & distribution.** Custom domain (instead of `onrender.com`), Play
   Store listing (possible later by packaging this web app), social / WhatsApp
   presence, launch offers for customers (coupons are in the PRD).
8. **Success metrics.** PRD North Star = weekly completed bookings; also booking
   completion rate (> 8%), salon activation, repeat bookings, reviews, owner churn.

---

## 5a. Business discussion — 2026-11-22 (founder stress-test Q&A)

Founder asked the hard questions directly: what's the actual purpose, is
this solving a real problem, why would a customer not just go straight to
the salon, why would a salon owner bother, how do we get customers to
actually reuse the app (vs. 1–2x/month), what about salons' existing
regulars who'll never open an app, and what happens when a customer takes
the salon's number and just calls them next time. Honest conclusions, not
sugar-coated:

- **The problem is real on the salon side, partial on the customer side.**
  Small salons genuinely run on a notebook + phone + WhatsApp — no
  calendar, no no-show protection, no digital presence. That's a clean,
  real gap. For customers, it's only a clear win for people who **don't
  already have "their" salon** — new to the area, comparing price/quality,
  trying a new service category (first facial, bridal grooming), or
  avoiding a walk-in wait. A habitual regular who already knows their
  barber, price and slot gets almost nothing from the app unless it's
  *faster than calling*. **Don't market this as "how everyone should book
  a haircut" — market it as the answer for when you don't already know
  where to go, or want certainty.**
- **Disintermediation (customer takes the number, goes direct next time)
  cannot be technically prevented** — it's a physical shop; even Uber can't
  stop someone writing down a driver's number in person. Masked in-app
  calling (already built) only blocks the "got it from an app call" path,
  not "asked at the counter." The strategy has to shift from *preventing*
  this to **being worth coming back to anyway**, and pricing the platform
  on the value it actually delivers (see §5b) rather than fighting an
  unwinnable battle.
- **How to increase reuse beyond 1–2x/month:** don't stay a single-service
  (haircut) app — spa, facials, waxing, mehendi, massage, nails all have
  different cycles, so one household using several of these has much
  higher combined frequency than one person's monthly haircut. The T-24h/
  T-1h reminder push (built 2026-11-22, see PROGRESS.md) exists specifically
  so staying on-platform is *less effort* than remembering to call. One-tap
  "book same as last time" has to beat dialing a number, or regulars have
  no reason to stay.
- **Salons' existing regulars will mostly never open the app themselves —
  that's expected, not a product failure.** The value there is to the
  *owner* (digitizing their base, no-show protection, fewer phone
  interruptions), not customer acquisition. The PRD already flags this as
  the #1 failure mode of local-services marketplaces generally: they fail
  on the **salon** side going stale, not the customer side. This is the
  strongest argument for **ops-assisted onboarding** (§5 item 3) — someone
  has to keep salon calendars current, self-serve alone historically
  doesn't work in this category.
- **Realistic year-1 usage mix:** mostly new-to-area people, first-time
  category shoppers, and wait-avoiders — not loyal monthly regulars
  switching behavior. Build the revenue model around that truth (§5b),
  not against it.

## 5b. Revenue model — proposed working plan (2026-11-22, not yet locked)

Starting point: the PRD's commission-per-booking idea taxes **every**
visit forever, including ones the platform didn't actually help create —
adversarial once a salon's regulars stop booking through the app after the
first match (see §5a). Proposed direction instead: **lead with a flat
monthly subscription to salons, add commission later and only on
marketplace-acquired new customers.**

### Why subscription first, not commission first
A marketplace needs **density before anyone will pay for anything** — a
salon won't pay for "more customers" if there's no customer flow yet, and
customers won't come if few salons are listed (classic chicken-and-egg).
So:
1. **Phase 1 — free for everyone.** Get 200+ salons live (PRD goal), prove
   the booking flow actually works end to end. No revenue; this is pure
   customer/salon acquisition, funded by ₹0 infra cost (§2) and the
   founder's own time.
2. **Phase 2 — flat subscription, once salons are seeing real bookings.**
   Only pitch paid tiers to salons who've already gotten value for free
   (e.g., 5+ completed bookings through the platform) — paying for proven
   value converts far better than paying for a promise.
3. **Phase 3 — commission, once Razorpay is live.** Charged only on
   bookings where the customer is new to that salon (trackable: "first
   booking at this business"), never on repeat visits — so the fee matches
   where the platform actually created the business, not where it's just
   riding along on an existing relationship.

### Proposed tiers (illustrative — tune against real salon feedback)

| Tier | Price | What the salon gets | Who it's for |
|---|---|---|---|
| **Free** | ₹0 | Listing, booking calendar, OTP check-in/no-show protection, owner push alerts | Everyone — this is the density/acquisition layer, not a revenue line |
| **Premium** | ~₹499–799/month | Everything in Free + basic analytics (busy hours, repeat-customer view), priority placement above Free salons in search (clearly organic-looking, not labelled "sponsored" — protects customer trust per PRD §5.12), more staff slots | Salons who've seen Trimly bring them real bookings and want more |
| **Featured** | ~₹300–500/week, pay-per-period | A clearly labelled "Featured" boost slot, separate from organic ranking | Salons wanting an extra push during a launch, festival season, or slow month |
| **Commission** (Phase 3 only) | 8–12% of ticket value | — | Only on a customer's *first* booking at that salon via Trimly |

### A worked example (order-of-magnitude, not a forecast)
Take the PRD's own year-1 goal: **200 verified salons in one city.**
- If **20–30% go Premium** (~40–60 salons) at ~₹599/month average:
  **₹24,000–36,000/month** subscription revenue.
- Why a salon would actually pay ₹599/month: a mid-size 3-chair salon
  commonly turns over roughly ₹1.5–4 lakh/month — ₹599 is well under 1% of
  that, and **avoiding just one no-show** (a ₹300–500 missed slot) most
  months already covers the fee. This is the pitch to make to owners, not
  "pay for an app."
- Add Phase 3 commission once it exists: if the platform drives, say, 500
  genuinely new-customer bookings/month citywide at an average ticket of
  ₹350, 10% commission ≈ **₹17,500/month** on top.
- Combined, early scale in one city: roughly **₹40,000–55,000/month**
  gross — deliberately modest. This is a thin-margin, scale-driven
  business like most hyperlocal marketplaces; it isn't meant to be
  profitable at 200 salons, it's meant to prove the model before expanding
  to more cities (PRD V2 goal: 3 cities, 2,000 salons).
- **Cost side stays low by design:** infra is ₹0 today (§2), rising to
  maybe ₹600–2,000/month on paid hosting once the free tier isn't enough,
  plus SMS (~₹0.15–0.25/message) and Razorpay's ~2% cut *on commission
  revenue itself* once that's live. **The real cost driver as this grows
  isn't tech, it's the human side of salon onboarding/relationship
  management (§5a)** — budget for that before counting subscription
  revenue as profit.
- **Where the actual profit comes from:** almost all subscription revenue
  is profit margin once infra is already ₹0-ish, *minus* whatever it costs
  to keep signing up and servicing salons (currently the founder's own
  time). The real break-even question isn't server cost — it's whether
  subscription revenue per salon covers the cost of whoever is doing that
  onboarding/support work as this scales past one person.

**Still open:** exact tier prices (need real salon-owner feedback, not just
this estimate), whether Premium placement risks looking like pay-to-rank to
customers (PRD §5.12 says it must stay visually distinct from earned
badges like Top Rated), and when to flip the commission switch on once
Razorpay exists.

---

## 6. Must-do before opening to the public

- [ ] **Remove the 12 demo salons, demo customers and reviews** from the live
      database (they're fictional seed data; the seed would also re-add them
      on each deploy unless the seed step is changed). Coordinate with the
      developer side: the deploy runs the seed.
- [ ] Decide what happens to the database before the free tier expires (backup / paid).
- [ ] Privacy policy + terms pages.
- [ ] Real salon photos (and replace Unsplash style photos over time).
- [ ] Admin Gmail set in `ADMIN_EMAILS` (done) and `PHONE_LOGIN=off` (done).
- [ ] Test a call between two phones on different mobile networks (Jio / Airtel
      / Vi); add a free TURN relay if some fail.

---

## 7. Security status (summary)

A pre-launch security review was done and the issues found were fixed and
attack-tested (details: DEVELOPER-GUIDE §10b). Remaining accepted items are
low-risk: development-tool package warnings, login token in browser storage,
unverified profile phone numbers until SMS exists.
