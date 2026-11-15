# TRIMLY — Product Requirements & Software Requirements Specification
### Marketplace for Barbers, Salons, Beauty Parlours & Grooming Services
**Document version:** 1.0 | **Status:** Draft for engineering kickoff | **Owner:** CTO/PM function

**Naming note:** Going with **Trimly** for this document (short, ownable domain likely available, works across genders/services unlike "Barberly"). Confirm trademark/domain availability before committing — treat as placeholder.

---

## 0. How to Read This Document

This is written so an engineering team can start building without pinging the founders every hour. It is organized by:
1. Strategy & scope (PRD)
2. Users (personas, journeys)
3. What the system must do (Functional Requirements, User Stories, Acceptance Criteria)
4. How well it must do it (NFRs)
5. How it's built (Architecture, API, DB, Security)
6. How it makes money (Revenue Model)

**Phasing convention used throughout:** every feature is tagged `[MVP]`, `[V2]`, or `[V3]`. Build MVP first, fully, before touching V2. This is the single biggest schedule risk in the original brief — treat phase discipline as non-negotiable.

---

## 1. Product Requirement Document (PRD)

### 1.1 Problem Statement
Customers discovering salons today rely on fragmented signals — Google/Justdial listings (often outdated), word of mouth, or walking in and hoping there's no wait. There's no single place to compare price, availability, and quality across grooming businesses, and no reliable way to book a guaranteed slot. Salon owners, meanwhile, have no digital storefront, no booking calendar, and no visibility into their own business analytics — most run on a physical register and a phone.

### 1.2 Product Vision
Trimly is a two-sided marketplace that makes booking a grooming appointment as reliable as booking a movie ticket, and gives salon owners a digital operating system for their business — bookings, staff, payments, and growth — that they couldn't otherwise afford to build.

### 1.3 Goals (12-month)
- [MVP] Launch in **one city** (pick one — do not launch multi-city on day one) with 200+ verified salons and 5,000+ completed bookings in the first 90 days.
- [MVP] Achieve booking completion rate (search → confirmed booking) above 8%.
- [V2] Cross 3 cities, 2,000 salons.
- [V2] Home services live and contributing 15% of GMV.
- [V3] Loyalty/subscription revenue contributing 10% of net revenue.

### 1.4 Non-Goals (explicitly out of scope for V1)
- Full inventory/POS replacement for salons (some competitors do this — it's a different, harder product; don't chase it yet).
- AI hairstyle try-on / virtual try-before-you-book. High engineering cost, unclear conversion lift, revisit in V3.
- International payments/multi-currency.
- Live GPS tracking of home-service professionals (V2 at earliest — requires background location permissions, battery/UX tradeoffs, and driver-app-grade infra).

### 1.5 Success Metrics (North Star + supporting)
- **North Star:** Weekly completed bookings (in-salon + home service).
- Supporting: booking completion rate, salon activation rate (salons with ≥1 completed booking within 14 days of onboarding), repeat booking rate (30/60/90-day), review submission rate, owner churn (salons going dormant >30 days), customer CAC vs LTV.

### 1.6 Assumptions to Validate Before Building (do this first, cheaply)
- Will salon owners actually keep their calendar updated without a human onboarding/success rep pushing them? (Most local-services marketplaces fail here, not on the customer side.) Plan for a manual/ops-assisted onboarding phase, not self-serve-only, at launch.
- Will customers pre-pay online for a haircut, or expect pay-at-shop? Build both from day one; don't assume online payment adoption.
- Home service demand — validate with a lightweight waitlist/landing page before building the full home-service booking flow.

### 1.7 Product Philosophy
Every feature request — from founders, engineers, or this document itself — must pass one test before it gets built: **does it save customers time, help salons earn more money, or increase trust?** If a proposed feature doesn't clearly do at least one of these three things, it doesn't ship, regardless of how impressive it sounds.

- **Saves customers time** — e.g., one-tap rebooking, "any staff" fallback, next-available-slot surfacing, smart reminders.
- **Helps salons earn more money** — e.g., dead-hour discovery via search ranking, home service reach, upsell prompts (service packages), reduced no-shows.
- **Increases trust** — e.g., verification gating, booking-linked reviews, transparent cancellation policy, staff-level ratings.

This is the filter to apply retroactively to the original brief's "Extra Features" list, and the filter every future roadmap item should be run through in planning. A feature that's purely competitive parity ("Zomato has it, so should we") does not automatically pass this test — it must still map to one of the three pillars for *this* product's users.

---

## 2. User Personas

### Persona 1 — "Anita," the Convenience-First Customer [Primary]
- 27, works in tech/services, urban, books via phone.
- Wants: guaranteed slot, transparent pricing, no surprises, good hygiene signals.
- Pain today: calls 3 salons to find one with availability; no way to compare price beforehand.
- Key features she needs: search + filter, transparent pricing, slot booking, reviews with photos.

### Persona 2 — "Ravi," the Habitual Barbershop Customer [Primary]
- 34, goes to the same barber every 3 weeks, price-sensitive, low app-engagement otherwise.
- Wants: fastest possible re-booking, doesn't want to browse — wants "book same as last time" in 2 taps.
- Key features: repeat booking, favorites, reminders.

### Persona 3 — "Meera," the Salon Owner [Primary]
- 41, owns a 3-chair unisex salon, not deeply tech-comfortable, manages via WhatsApp and a notebook today.
- Wants: fewer no-shows, more customers in slow hours, doesn't want to pay for something complicated.
- Key features: dead-simple dashboard, WhatsApp-style notifications she already understands, clear "money in" view.

### Persona 4 — "Business Owner - Chain/Premium Salon" [Secondary, V2 focus]
- Manages multiple staff, multiple branches, wants analytics, staff performance, premium/featured listing ROI.

### Persona 5 — Platform Admin / Ops [Internal]
- Handles verification, disputes, fraud/fake reviews, support tickets.

---

## 3. User Journey Maps

### 3.1 Customer Journey — First-Time Booking [MVP]
1. **Discover:** Opens app/web → grants/enters location → sees nearby salons ranked by relevance (distance + rating + availability).
2. **Evaluate:** Filters by category (Men/Women/Unisex) and "Open Now" → opens a salon card → views gallery, services, reviews.
3. **Decide:** Picks a service → sees price + duration + next available slot.
4. **Book:** Selects date/time/staff (or "any staff") → chooses pay-now or pay-at-shop → confirms.
5. **Pre-visit:** Gets confirmation + reminder notification (T-24h, T-1h).
6. **Visit:** Arrives, salon verifies via OTP shown to staff → service delivered → OTP/staff marks complete.
7. **Post-visit:** Prompted to review (rating + optional photo) → booking saved to history for one-tap rebook next time.

**Drop-off risks to design against:** location permission denial (must have manual address entry fallback), no slots available at preferred time (must show next-best alternatives, not a dead end), payment failure (must allow "pay at shop" as always-available fallback in MVP).

### 3.2 Salon Owner Journey — Onboarding [MVP]
1. Signs up → enters business details, address (pinned on map), working hours, phone.
2. Uploads logo, cover photo, minimum 3 gallery images (enforce a minimum — empty galleries kill conversion).
3. Adds services (name, price, duration) — provide a **prefilled template** of common services by category so owners aren't starting from a blank form (this directly affects activation rate).
4. Uploads verification document (ops reviews within X hours — define SLA, e.g., 24h).
5. Sets availability / staff (or marks "no staff assignment, any available").
6. Goes live → appears in search once verified.
7. Receives first booking → dashboard notification (push + SMS, since owner may not have app open) → accepts/confirms.

### 3.3 Home Service Journey [V2]
Choose services → select saved/new address → pick time window → system calculates travel fee by distance/zone → professional assigned (manual dispatch acceptable at launch; auto-matching is V3) → booking confirmed → service completed, marked via OTP → review.

---

## 4. Business Flow

### 4.1 Core Booking State Machine
`PENDING → CONFIRMED → (RESCHEDULED | CANCELLED) → IN_PROGRESS (OTP verified) → COMPLETED → REVIEWED`
- `CANCELLED` can branch from `PENDING` or `CONFIRMED` by either party, with different refund rules (see 4.3).
- `NO_SHOW` is a distinct terminal state from `CONFIRMED` (customer didn't arrive) — needed for owner trust metrics and repeat-offender flagging.

### 4.2 Booking Ownership Rules
- A slot is only "held" (soft-locked) for a short window (e.g., 5 minutes) during checkout to prevent double-booking during payment — release the hold if payment isn't completed.
- Staff-specific bookings must check that staff member's calendar; "any staff" bookings check aggregate salon capacity.

### 4.3 Cancellation & Refund Policy (business rule, needs product sign-off, engineering just needs to enforce it)
- Suggested default: free cancellation up to 2 hours before slot; below that, salon-configurable penalty (0–100% of prepaid amount), with the salon's policy shown to the customer *before* they book, not after.
- Salon-initiated cancellation: always full refund + apology notification + priority rebooking slot suggestion.

### 4.4 Verification/Trust Flow
- Salon verification (business docs) gates visibility in search — unverified salons are not shown to customers, full stop. Don't let "pending verification" salons leak into search results.
- Review authenticity: only bookings marked `COMPLETED` can leave a review, tied 1:1 to that booking (prevents fake reviews at the data model level, not just moderation level).

### 4.5 No-Show Management
No-shows are one of the top reasons local-services marketplaces lose salon trust — a salon that holds a chair empty for a no-show customer loses real money, and if the platform doesn't visibly address this, owners will stop trusting online bookings altogether. This must be treated as a first-class flow, not an edge case.

- Every completed or missed booking updates the customer's **reliability score** (see §8 for schema) — a rolling score based on completed vs. no-show bookings over a trailing window (e.g., last 90 days), not a lifetime ban-style counter.
- **Repeat no-show detection:** a customer crossing a no-show threshold (e.g., 2 no-shows in 90 days) is automatically flagged; flagging is visible to the salon at booking-request time (not hidden), so the owner can make an informed accept/decline decision.
- **Mandatory prepayment for risky users:** once flagged, the "pay-at-shop" option is removed for that customer's future bookings — they must prepay. This is a proportionate, reversible restriction (score recovers with completed bookings), not a permanent ban, and should be clearly communicated to the customer, not silently applied.
- No-show marking itself must be owner-initiated with a reason code (not automatic on missed OTP) to avoid false positives from late arrivals or owner-side scheduling issues — automatic flagging without a human decision point invites abuse from the salon side too.
- Rationale (Product Philosophy check): this is squarely a **trust** feature, and indirectly a **salon earns more money** feature (fewer wasted chair-hours).

### 4.6 Waitlist on Cancellation
When a booking is cancelled (by either party) and the slot becomes available again, customers who had shown interest in that slot should be notified automatically rather than the slot simply reappearing silently in search.
- A customer can join a waitlist for a specific salon/service/date/time-window combination when their preferred slot is unavailable at search/booking time.
- On cancellation freeing that slot, the platform notifies waitlisted customers in order (first-joined-first-notified, with a short claim window, e.g., 10 minutes, before offering to the next person in line) — this must reuse the existing slot-hold locking mechanism (§7.3) to avoid two waitlisted customers claiming the same freed slot.
- Rationale (Product Philosophy check): saves customers **time** (they don't have to keep manually re-checking) and helps salons **earn more money** (a cancellation that would otherwise be a dead slot gets refilled automatically).

---

## 5. Functional Requirements & User Stories

Format: **FR-ID | User Story | Acceptance Criteria | Phase**

### 5.1 Authentication & Accounts
**FR-1.1** — As a customer, I want to sign up/log in via email, Google, or phone OTP, so I can access the platform with minimal friction. **[MVP]**
- AC: All three methods create a unique user record keyed by verified email or phone; duplicate accounts across methods for the same verified contact must be preventable or mergeable.
- AC: OTP expires in 5 minutes, max 5 attempts, rate-limited to 3 sends per 10 minutes per number.
- AC: Forgot-password flow invalidates all existing sessions on reset.

**FR-1.2** — As a business owner, I want a separate registration flow from customers, so the platform correctly routes me to the owner dashboard. **[MVP]**
- AC: Role is set at signup and is not self-upgradable by the user (role changes require admin action) to prevent privilege escalation.

### 5.2 Search & Discovery
**FR-2.1** — As a customer, I want to search salons near my location with filters (category, open now, price range, rating, home service), so I can find a relevant option fast. **[MVP]**
- AC: Default sort is a weighted blend of distance, rating, and availability (not pure distance — a 5★ salon 200m further should often outrank a 2★ one closer; make the weighting configurable, not hardcoded).
- AC: Results return in <500ms server-side at up to 5,000 salons per city (see NFR).
- AC: Empty results show relaxed-filter suggestions, never a dead end.

**FR-2.2** — As a customer, I want each result card to show image, rating, distance, starting price, next available slot, and open/closed status, so I can compare without opening each profile. **[MVP]**

**FR-2.3** — AI Chat Assistant ("find me a barber under ₹300 nearby") **[V3]** — explicitly deferred; requires sufficient salon density and structured service/price data to produce non-embarrassing results.

### 5.3 Salon Profile
**FR-3.1** — As a customer, I want to view a salon's full profile (gallery, services, hours, policies, reviews, map), so I can make a confident booking decision. **[MVP]**
- AC: Map shows pin + one-tap "Directions" deep link to Google/Apple Maps (do not build custom turn-by-turn — use the native maps app).

**FR-3.2** — As a customer, I want to view an individual barber/stylist's profile before choosing them, so I can pick based on fit, not just salon reputation. **[MVP core fields; gallery/certifications V2]**
- Portfolio of work (photo gallery tied to this staff member specifically, not just the salon gallery). **[V2]**
- Experience (years, prior salons if disclosed). **[MVP]**
- Specializations (e.g., fades, bridal makeup, beard sculpting, color correction) — should be a structured tag set, not free text, so it's filterable in search later. **[MVP]**
- Languages spoken. **[MVP]**
- Certifications (uploaded by owner, shown as badges — not independently verified by the platform at MVP; label them "self-reported" to avoid overstating trust). **[V2]**
- Before & After gallery, paired photo sets tied to specific completed bookings where possible (strengthens authenticity vs. generic stock-style photos). **[V2]**
- Individual staff rating, computed separately from the salon's overall rating (a booking's review should optionally let the customer rate the staff member, not just the salon). **[MVP]**
- AC: Customers can filter/select staff at booking time by specialization or rating, not just by name (see FR-4.1).
- Rationale (Product Philosophy check): staff-level profiles directly increase **trust** (informed choice reduces bad-match visits) and help salons **earn more money** (a well-reviewed stylist becomes a reason to book that specific salon, and a retention lever — customers rebook their preferred stylist, not just the salon).

### 5.4 Booking
**FR-4.1** — As a customer, I want to select a service, date, time, and staff (or "any"), and confirm a booking with payment or pay-at-shop, so my slot is guaranteed. **[MVP]**
- AC: Slot availability is checked at selection time and re-validated at confirmation time (handles race conditions between two customers picking the same slot).
- AC: Booking confirmation triggers notification to both customer and salon within 5 seconds.

**FR-4.2** — As a customer, I want to reschedule or cancel a booking within policy, so I have flexibility. **[MVP]**
- AC: Reschedule releases the old slot and holds the new one atomically (no ability to end up with neither, or double-booked).

**FR-4.3** — As a salon owner, I want to accept/reject/reschedule bookings from my dashboard, so I control my calendar. **[MVP]**

**FR-4.4** — As a salon staff member, I want to mark a booking complete via OTP entered by the customer, so completion is verifiably tied to an actual visit. **[MVP]**
- AC: OTP is generated at booking confirmation, shown to the customer in-app, single-use, tied to that booking ID only.

**FR-4.5** — As a customer, I want to join a waitlist for a fully-booked slot and be notified if it opens up, so I don't have to keep re-checking manually. **[V2]** — see §4.6 for the full flow.
- AC: Waitlist notification respects the same slot-locking mechanism as normal booking to prevent double-claims.

**FR-4.6** — As a salon owner, I want repeat no-show customers flagged and required to prepay, so I'm not repeatedly losing chair-time to unreliable bookings. **[MVP: reliability score + flag; V2: automatic prepayment enforcement]** — see §4.5 for the full flow.
- AC: Owner must supply a reason code when marking a booking `NO_SHOW`; this cannot be system-automated at MVP.

### 5.5 Reviews
**FR-5.1** — As a customer, I want to leave a rating, text, and photos for a completed booking, so future customers get honest signal. **[MVP]**
- AC: Review submission is only possible for `COMPLETED` bookings, one review per booking.
- AC: Owner can reply publicly to a review but cannot delete it; can flag for admin review if suspected fake/abusive.

### 5.6 Business Owner Dashboard
**FR-6.1** — As a salon owner, I want a dashboard showing today's bookings, revenue, and cancellations, so I can run my day. **[MVP]**
**FR-6.2** — As a salon owner, I want to add/edit/delete services and staff, so my listing stays accurate. **[MVP]**
**FR-6.3** — As a salon owner, I want analytics (popular services, peak hours, retention), so I can make business decisions. **[V2]** — MVP gets basic counts; deeper analytics is V2, not a launch blocker.

### 5.7 Admin Panel
**FR-7.1** — As an admin, I want to verify/reject business registrations with documents, so only legitimate salons go live. **[MVP]**
**FR-7.2** — As an admin, I want to manage categories, cities, coupons, and featured listings, so the platform stays configurable without a code deploy. **[MVP]**
**FR-7.3** — As an admin, I want to view flagged reviews and support tickets, so trust & safety issues get resolved. **[MVP, lightweight version]**

### 5.8 Home Service **[V2]**
Deferred as a full flow — validate demand first (see 1.6). Data model should reserve fields for it (see §8) but UI/booking logic is V2.

### 5.9 Payments
**FR-9.1** — As a customer, I want to pay via UPI/card/wallet through Razorpay, or choose pay-at-shop, so I have payment flexibility. **[MVP]**
- AC: Payment failure never blocks booking creation if pay-at-shop is chosen; payment success is required before a prepaid booking is marked `CONFIRMED`.

### 5.10 Notifications
**FR-10.1** — As a customer/owner, I want SMS + push notifications for booking confirmation, reminders (T-24h, T-1h), and cancellations, so I don't miss appointments. **[MVP]**
- Email is supplementary in MVP; SMS/push are primary given the target user (owners especially may not have the app open).
- WhatsApp Business API notifications **[V2]** — higher open rates than push in India, worth prioritizing early in V2.

### 5.11 Customer Retention
Retention mechanics should be sequenced deliberately — cheap, high-signal mechanics first, monetary commitments (wallet, memberships) once there's enough booking volume to make them sustainable. Every item below must still pass the Product Philosophy test (§1.7): retention features exist to save customers time or build trust, not to lock them in artificially.

**FR-11.1** — Smart rebooking reminders: as a customer, I want to be reminded when I'm due for my next haircut (based on my typical rebooking interval), so I don't have to remember myself. **[MVP]**
- AC: Interval is inferred per-customer from their own booking history (e.g., median days between past bookings), not a fixed platform-wide default — this is what makes it "smart" rather than a generic marketing blast.

**FR-11.2** — Favourites & one-tap repeat booking: already covered under Persona 2 / §3.1 — cross-referenced here as a retention mechanic, not a new build item.

**FR-11.3** — Referral program: as a customer, I want to invite friends and receive a reward when they complete their first booking, so I'm incentivized to bring others onto the platform. **[V2]**
- AC: Reward is only credited on the referred user's first `COMPLETED` booking (not signup), to avoid rewarding fake/unconverted referrals.

**FR-11.4** — Loyalty points: as a customer, I want to earn points on completed bookings that I can redeem for discounts, so repeat usage is rewarded. **[V2]**
- AC: Points accrue only on `COMPLETED` bookings (not `CONFIRMED`), and expire on a defined policy (e.g., 12 months) — must be configurable platform-wide, not hardcoded.

**FR-11.5** — Wallet: as a customer, I want a platform wallet to hold refunds, referral rewards, and cashback, so I don't need a fresh payment method every time those are issued. **[V2]**
- AC: Wallet balance is refund/reward-funded only at V2 (no direct top-up) to avoid triggering payment-instrument/regulatory complexity (e.g., PPI licensing considerations in India) prematurely — direct wallet top-up is a **[V3]** decision requiring legal review, not an engineering one.

**FR-11.6** — Memberships (e.g., discounted-rate unlimited or bundled services at a specific salon or platform-wide): as a customer, I want a membership option for salons I visit regularly, so I get better value for my loyalty. **[V3]** — deferred; depends on booking volume and salon willingness to offer bundled pricing, consistent with §1.4 non-goals.

### 5.12 Business Trust Levels
A single "verified/unverified" flag (as originally scoped in §4.4) is enough for MVP launch-safety, but doesn't give customers a way to distinguish quality among verified salons, and doesn't give the platform a lever to reward good-performing salons. Introduce a tiered trust system, surfaced as a visible badge on search cards and profiles:

- **Verified** **[MVP]** — passed the existing document-verification flow (§4.4). Table stakes to appear in search at all.
- **Top Rated** **[V2]** — automatically computed, not manually assigned: e.g., rolling average rating ≥ 4.5 with a minimum review count (e.g., 20+ in trailing 90 days), recalculated periodically, not a one-time award. Must be algorithmic and re-earned continuously so it can't go stale.
- **Premium Partner** **[V2]** — tied to the paid subscription tier (§11 Revenue Model), not a quality signal by itself — should be visually distinct from Top Rated so customers don't confuse "paid for a badge" with "earned a badge." This distinction matters for platform credibility.
- **Featured** **[V2]** — sponsored placement (§11 Revenue Model, FR already noted there), time-boxed and clearly labeled "Featured"/"Sponsored" in the UI, consistent with the existing requirement that paid placement stay visually distinguishable from organic ranking.
- AC: A salon can hold multiple badges simultaneously (e.g., Verified + Top Rated + Premium Partner) — badges are additive, not mutually exclusive tiers.
- Rationale (Product Philosophy check): Verified and Top Rated increase **trust**; Premium Partner and Featured help salons **earn more money** (visibility) and fund the platform — keeping the two categories visually distinct protects the trust side from being undermined by the monetization side.

---

## 6. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Search API p95 latency < 500ms at 5,000 salons/city, 50k concurrent users at launch scale |
| Availability | 99.5% uptime target for MVP (not 99.99% — don't over-engineer for scale you don't have yet) |
| Scalability | Stateless API layer, horizontally scalable; DB read replicas introduced when read QPS exceeds single-instance capacity, not preemptively |
| Security | OWASP Top 10 mitigations, encrypted at rest and in transit, role-based access control, rate limiting on auth and search endpoints |
| Data Privacy | PII (phone, email, address) encrypted at rest; comply with India's DPDP Act — consent capture, data deletion on request |
| Accessibility | WCAG 2.1 AA for core booking flow (this is often skipped — don't skip it; it also improves SEO) |
| SEO | Server-rendered salon profile pages (SSR/ISR), structured data (schema.org LocalBusiness), sitemap, clean URLs |
| Observability | Centralized error logging (e.g., Sentry-equivalent), uptime monitoring, booking-funnel analytics from day one |
| Mobile | Fully responsive web at MVP; native app or PWA install-ability is V2 — don't build two native apps before validating the web funnel |
| Localization | English-only at MVP; regional language support is V2, tied to city expansion |

---

## 7. System Architecture

### 7.1 Architectural Decision — Backend Split (flagged decision, needs sign-off)
Recommendation: **separate backend service (NestJS) from day one**, even though Next.js API routes would be faster to prototype. Reasoning: booking logic involves slot-locking, payment webhooks, scheduled notification jobs, and background workers (reminders, payout reconciliation) — these are awkward to run reliably inside a serverless Next.js API route. A dedicated NestJS service with a job queue is more maintainable as booking volume grows, and decouples backend release cycles from frontend deploys.

### 7.2 High-Level Components
- **Web app (Next.js 15, SSR/ISR)** — customer-facing marketing pages, search, salon profiles (SEO-critical, SSR), owner dashboard, admin panel (can be a separate internal app).
- **API layer (NestJS)** — auth, search, booking engine, payments, notifications orchestration, admin operations. REST for CRUD-heavy resources; consider a dedicated booking/availability service if load demands it later — not at MVP.
- **Database (PostgreSQL via Supabase/Neon)** — system of record.
- **Cache (Redis)** — search result caching, slot-hold locks (short TTL keys), rate-limit counters, session data if not using JWT-only auth.
- **Job queue (e.g., BullMQ on Redis)** — booking reminders, notification dispatch, review-prompt scheduling, payout batch jobs.
- **Search** — Postgres full-text + PostGIS for geo-distance queries is sufficient at MVP scale; do not introduce Elasticsearch until salon count or query complexity genuinely requires it.
- **Storage (Cloudinary)** — images/video, with responsive/optimized delivery.
- **Maps (Google Maps API)** — geocoding at salon registration, distance calc, "Directions" deep link. Avoid heavy Maps JS SDK usage on every search-results render — use static maps/lite embeds where possible to control API cost.
- **Payments (Razorpay)** — orders, webhooks for payment confirmation, refunds.
- **Notifications** — SMS/WhatsApp provider (e.g., MSG91/Gupshup for India), push (Firebase Cloud Messaging), email (Resend) — all triggered via the job queue, not synchronously in the request path.
- **Auth** — Auth.js (or Clerk if team velocity matters more than vendor lock-in cost — flagged decision, see §1.6.4) issuing JWTs; role claims (`customer`, `owner`, `staff`, `admin`) embedded and enforced via middleware.

### 7.3 Request Flow Example — Booking Creation
1. Client → API: `POST /bookings` with service, slot, staff, payment method.
2. API acquires a short-TTL Redis lock on `(salonId, staffId, slot)`.
3. If pay-now: create Razorpay order, return payment intent to client.
4. Razorpay webhook confirms payment → API marks booking `CONFIRMED`, releases nothing (slot is now permanently held by this booking), enqueues confirmation + reminder jobs.
5. If pay-at-shop: booking goes straight to `CONFIRMED`, same notification enqueue.
6. Lock auto-expires if payment isn't completed within the hold window, freeing the slot.

### 7.4 Deployment
- Frontend: Vercel. Backend: containerized (e.g., Fly.io/Railway/AWS ECS) — Vercel serverless is a poor fit for the NestJS service given persistent job workers.
- Environments: `dev`, `staging`, `prod`, with separate DB instances and Redis instances per environment — do not share staging/prod Redis (a common source of real incidents: leaked locks/rate-limits crossing environments).

### 7.5 Future-Ready Architecture — Home Services Without a Rewrite
Home service is explicitly deferred to V2 (§1.4, §5.8), but the *data model and booking engine* should be designed now so enabling it later is a feature flag and a UI build, not a schema migration + booking-logic rewrite. Concretely:

- The `bookings` table (§8) should model location generically from day one — every booking references either a `business_id` location (in-salon) or a customer `address_id` (home service) via a nullable `service_location_type` enum + nullable `address_id` FK, even though only the in-salon path is active at MVP. Retrofitting a "where did this booking happen" concept after launch is far more disruptive than reserving the field now.
- The booking state machine (§4.1) is location-agnostic by design — `PENDING → CONFIRMED → IN_PROGRESS → COMPLETED` applies identically whether the professional travels to the customer or vice versa. No home-service-specific states should be needed beyond the already-reserved `home_service_areas` table (§8) and a travel-fee calculation step inserted into the existing pricing calculation, not a parallel booking pipeline.
- Staff availability (§8 `staff_availability`) should already support a "location capability" flag per staff member (can this person do home visits) even if unused at MVP — cheap to add now, expensive to bolt on once staff records and historical bookings already exist without it.
- Notification templates (§8 `notifications_log`) should be parameterized by booking type from the start, so adding "professional en route" / "travel fee confirmed" templates later doesn't require restructuring the notification dispatch job.
- Practical takeaway for engineering: build the in-salon-only MVP, but review every schema addition in §8 against the question "would this field make sense for a home-service booking too?" before finalizing it.

---

## 8. Database Requirements (schema-level, not code)

Core entities and key relationships (normalized, foreign-keyed):

- **users** (id, role, name, phone, email, auth_provider, created_at)
- **customer_profiles** (user_id FK, wallet_balance[future], reliability_score, no_show_count_rolling, requires_prepayment boolean) — reliability/no-show fields added for §4.5 No-Show Management
- **addresses** (id, user_id FK, label, lat, lng, formatted_address) — supports multiple saved addresses for home service
- **businesses** (id, owner_user_id FK, name, category, gst_optional, description, verification_status, trust_badges[] or normalized badge table (see `business_trust_badges` below), lat, lng, city_id FK, working_hours JSON or normalized table)
- **business_trust_badges** (id, business_id FK, badge_type enum [`verified`,`top_rated`,`premium_partner`,`featured`], awarded_at, expires_at nullable, source [`automatic`|`subscription`|`admin`]) — normalized rather than a flag array so each badge (§5.12) has its own award/expiry logic and audit trail
- **business_images / business_videos** (id, business_id FK, url, type, order)
- **categories** (id, name, parent_id nullable — supports Men/Women/Unisex/Spa hierarchy)
- **services** (id, business_id FK, category_id FK, name, price, duration_minutes, description, active)
- **staff** (id, business_id FK, name, experience_years, specializations[] tag array, languages[] tag array, photo_url, average_rating computed, home_service_capable boolean [reserved for §7.5], active)
- **staff_certifications** (id, staff_id FK, name, issuing_body, document_url, self_reported boolean default true) — supports §5.3 FR-3.2 certification badges
- **staff_portfolio_media** (id, staff_id FK, url, type [`portfolio`|`before_after`], paired_media_id nullable [links a before photo to its after photo], linked_booking_id FK nullable [ties before/after to a real completed booking where available])
- **staff_availability / time_slots** (id, staff_id FK, day_of_week or specific_date, start_time, end_time) — model recurring weekly availability separately from date-specific overrides (holidays, one-off closures) to avoid overloading one table
- **bookings** (id, customer_id FK, business_id FK, staff_id FK nullable, service_id FK, slot_start, slot_end, status enum [now including `NO_SHOW`], service_location_type enum [`in_salon`|`home_service`] default `in_salon`, address_id FK nullable [used only when `home_service`], otp_hash, payment_id FK nullable, cancellation_reason nullable, no_show_reason_code nullable, created_at) — location fields added per §7.5 so home service needs no later migration
- **payments** (id, booking_id FK, provider, provider_order_id, amount, status, refund_amount nullable)
- **reviews** (id, booking_id FK unique, customer_id FK, business_id FK, staff_id FK nullable [optional staff-specific rating per §5.3], rating, staff_rating nullable, text, created_at)
- **review_media** (id, review_id FK, url, type)
- **coupons** (id, code, discount_type, value, business_id FK nullable [platform-wide if null], valid_from, valid_to, usage_limit)
- **subscriptions** (id, business_id FK, plan_tier, status, renewed_at) — for owner Free/Premium/Featured plans; feeds `business_trust_badges` where `source = subscription`
- **home_service_areas** (id, business_id FK, city_id FK, radius_km or polygon, travel_fee_base, travel_fee_per_km) **[V2 fields, reserve in schema now]**
- **waitlist_entries** (id, customer_id FK, business_id FK, service_id FK, staff_id FK nullable, desired_date, desired_time_window, status enum [`waiting`|`notified`|`claimed`|`expired`], notified_at nullable) — supports §4.6 Waitlist System
- **loyalty_points_ledger** (id, customer_id FK, booking_id FK nullable, points_delta, reason [`earned`|`redeemed`|`expired`], created_at) — supports §5.11 FR-11.4, ledger-style rather than a single mutable balance so history is auditable
- **referrals** (id, referrer_user_id FK, referred_user_id FK, status [`pending`|`rewarded`], reward_credited_at nullable) — supports §5.11 FR-11.3
- **notifications_log** (id, user_id FK, channel, template, status, sent_at)
- **audit_logs** (id, actor_user_id FK, action, entity_type, entity_id, metadata JSON, created_at) — required for verification decisions, cancellations, refunds, no-show flags, and badge awards; needed for dispute resolution, don't skip this table

**Indexing priorities:** geo-index (PostGIS GIST) on `businesses(lat,lng)`; composite index on `bookings(business_id, slot_start, status)` for the booking-collision check; index on `reviews(business_id)` for profile page reads; index on `waitlist_entries(business_id, desired_date, status)` for cancellation-triggered notification lookups; index on `customer_profiles(reliability_score)` for no-show risk queries.

---

## 9. API Requirements (representative, not exhaustive — full OpenAPI spec is a build-phase deliverable)

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/auth/otp/send`, `/auth/otp/verify` | POST | Phone auth | Public (rate-limited) |
| `/search/businesses` | GET | Geo + filter search | Public |
| `/businesses/:id` | GET | Full profile | Public |
| `/businesses/:id/availability` | GET | Slot lookup for a service/staff/date | Public |
| `/bookings` | POST | Create booking (see 7.3 flow) | Customer |
| `/bookings/:id/cancel`, `/reschedule` | POST | Modify booking | Customer/Owner |
| `/bookings/:id/complete` | POST | OTP-verified completion | Owner/Staff |
| `/reviews` | POST | Submit review (booking-linked) | Customer |
| `/owner/businesses/:id` | PATCH | Update business/services/staff | Owner |
| `/owner/dashboard` | GET | Bookings/revenue summary | Owner |
| `/admin/businesses/:id/verify` | POST | Approve/reject business | Admin |
| `/webhooks/razorpay` | POST | Payment status updates | Signed webhook |

**Requirements:** all mutating endpoints require input validation (schema-based, e.g., Zod on the boundary), idempotency keys on booking/payment creation endpoints to safely handle client retries, and consistent error envelope format across the API.

---

## 10. Security Requirements
- RBAC enforced server-side on every endpoint — never trust a client-sent role.
- Rate limiting on auth (OTP send/verify), search (prevent scraping), and booking creation endpoints.
- Webhook signature verification for Razorpay (and any future provider) — reject unsigned/invalid payloads.
- OTP hashes stored, not plaintext; single-use, short expiry.
- File upload validation (type/size limits, virus/malware scan on business verification documents before admin review).
- Audit log on all admin actions and refund/cancellation decisions (see §8).
- Secrets management via environment-specific vaults, never committed; separate keys per environment (§7.4).
- Regular dependency vulnerability scanning in CI.
- PII access logging for compliance and internal misuse detection.

---

## 11. Revenue Model
1. **Commission per booking [MVP]** — a percentage of booking value (industry norm 10–20%; recommend starting lower, e.g., 8–12%, to drive salon adoption, and increasing later once retention data justifies it).
2. **Subscription tiers for salons [MVP-lite → V2 full]** — Free (basic listing) / Premium (analytics, priority support) / Featured (boosted search placement) — reuse the `subscriptions` table from day one even if only Free exists at launch.
3. **Featured/sponsored listings [V2]** — pay-for-placement, separate from organic ranking algorithm (keep these visually distinguishable to preserve customer trust — undisclosed pay-to-rank erodes the marketplace's core value prop).
4. **Coupons/promotions funded jointly** by platform (customer acquisition) and salon (retention) — track funding source per coupon for accounting clarity.
5. **Gift vouchers, subscriptions for unlimited services [V3]** — real revenue upside but needs booking volume and trust maturity first; premature at MVP.

**Explicit rejection:** Do not charge customers a booking/platform fee at MVP — it directly suppresses the funnel you're trying to validate (booking completion rate is your primary metric right now).

---

## 12. Open Decisions Requiring Founder/Eng-Lead Sign-off
1. Backend split: NestJS service vs. Next.js API routes (recommend NestJS — §7.1).
2. Auth provider: Clerk vs. Auth.js (recommend Auth.js for cost/control — §1.6).
3. Launch city and initial salon-acquisition strategy (sales-assisted vs. self-serve onboarding).
4. Commission rate at launch.
5. Whether home service is validated enough to build in V2 or needs a pre-launch demand test first.

---

## 13. Technical Decision Log (Architecture Decision Records)

Lightweight ADRs for the major calls already made in this document, so future engineers understand *why*, not just *what*. Format: **Decision | Status | Context | Alternatives Considered | Consequences.** New ADRs should be appended, never edited in place, when a decision is revisited.

### ADR-001: Separate NestJS Backend Instead of Next.js API Routes
- **Status:** Proposed (pending sign-off, §12.1)
- **Context:** Booking logic requires slot-locking, payment webhooks, and background jobs (reminders, payouts) that need persistent workers, not just request/response handlers.
- **Alternatives considered:** Next.js API routes only (faster initial prototyping, but poor fit for long-running/background work on serverless); a fully separate booking microservice from day one (rejected as premature — adds operational overhead before there's traffic to justify it).
- **Consequences:** Slightly more initial setup (two deployable units instead of one); cleaner separation of concerns and independent scaling/release cycles as booking volume grows.

### ADR-002: Auth.js Over Clerk
- **Status:** Proposed (pending sign-off, §12.2)
- **Context:** Need auth across three methods (email, Google, phone OTP) plus role-based access for four user types.
- **Alternatives considered:** Clerk (faster to integrate, less code to own, but per-MAU pricing becomes expensive at marketplace scale and couples core identity data to a third-party vendor).
- **Consequences:** More initial engineering effort to wire up OTP and session handling; lower long-term cost and full control over user data at scale.

### ADR-003: PostGIS + Postgres Full-Text Search Over Elasticsearch (MVP)
- **Status:** Accepted
- **Context:** Search needs geo-distance ranking and basic filtering at launch scale (single city, low thousands of salons).
- **Alternatives considered:** Elasticsearch (better full-text relevance and scaling ceiling, but adds a second data store to keep in sync and operate, unjustified at MVP salon counts).
- **Consequences:** Simpler ops surface at launch; will need to be revisited (§7.2) if search complexity or city count grows well beyond MVP scope.

### ADR-004: Location-Agnostic Booking Schema From Day One (Home Service Future-Proofing)
- **Status:** Accepted
- **Context:** Home service is deferred to V2 (§1.4), but retrofitting location semantics onto an existing `bookings` table after real booking history exists is significantly riskier than reserving the fields now.
- **Alternatives considered:** Build the in-salon-only schema first and migrate later (rejected — migrating a high-write table with a growing foreign-key graph mid-flight is a much larger risk than a few nullable columns today); build a fully separate `home_service_bookings` table now (rejected — creates two parallel booking pipelines to maintain and reconcile for no current benefit).
- **Consequences:** A handful of currently-unused nullable columns/tables at MVP (§7.5, §8); meaningfully lower risk and effort when Home Service is actually built in V2.

### ADR-005: Reliability Score as a Rolling Metric, Not a Lifetime Ban Counter
- **Status:** Accepted
- **Context:** No-show management (§4.5) needs to identify risky customers without permanently penalizing someone for a one-off missed appointment years ago.
- **Alternatives considered:** Lifetime no-show count with a hard ban threshold (rejected — too punitive, no path to recovery, likely to generate support disputes and churn otherwise-good customers over one bad week).
- **Consequences:** Slightly more complex query (rolling window aggregation) instead of a simple counter; a fairer, recoverable system that owners and customers are more likely to trust.

### ADR-006: Trust Badges as a Normalized Table, Not a Flag/Array on `businesses`
- **Status:** Accepted
- **Context:** Business Trust Levels (§5.12) has four badge types with different award logic, sources, and expiry rules (algorithmic vs. subscription-driven vs. admin-assigned).
- **Alternatives considered:** A single `trust_level` enum column on `businesses` (rejected — badges are additive and independently sourced/expiring, an enum can't represent "Verified + Top Rated + Premium Partner" simultaneously with different expiry dates).
- **Consequences:** One additional join for profile/search rendering; correct modeling of a genuinely multi-valued, time-bound concept, and a clean audit trail per badge.

---

*End of document. Next recommended step: engineering breaks §5 (Functional Requirements) into sprint-sized tickets per phase tag; design produces wireframes for the Customer MVP journey (§3.1) before any UI code is written.*
