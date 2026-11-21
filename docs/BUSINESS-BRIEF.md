# Trimly — Business Brief & Handoff

**Purpose:** starting point for business / go-to-market discussions. It covers
what exists today, what it costs, what the founder has already decided, and the
open questions. Technical detail lives in `docs/DEVELOPER-GUIDE.md`; product
requirements and the original strategy in `docs/Trimly-PRD-SRS-v1 updated.md`.

_Status as of 2026-11-21 (end of the first build day)._

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
   payments exist (or salons are invoiced). Decide model, rates and timing.
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
