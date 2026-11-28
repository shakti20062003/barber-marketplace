'use client';

import { useEffect, useState } from 'react';
import { getStoredUser } from '@/lib/auth-client';
import type { CurrentUser } from '@/lib/types';

type Audience = 'customer' | 'owner';

type Tier = {
  name: string;
  price: string;
  bullets: string[];
  cta: string;
  note: string;
  highlight?: boolean;
};

const CUSTOMER_TIERS: Tier[] = [
  {
    name: 'Plus',
    price: '₹0',
    bullets: ['Book instantly at verified salons', 'Save your favourite salons', 'Booking reminders'],
    cta: 'Get Plus',
    note: 'This is what every Trimly customer already gets today.',
  },
  {
    name: 'Pro',
    price: '₹99/mo',
    bullets: ['Everything in Plus', 'Priority slot holds', 'Early access to festival-season deals', 'One-tap rebooking'],
    cta: 'Get Pro',
    note: 'Launching soon — nothing is charged today.',
    highlight: true,
  },
  {
    name: 'Premium',
    price: '₹199/mo',
    bullets: ['Everything in Pro', 'Member-only pricing on select services', 'Dedicated support'],
    cta: 'Get Premium',
    note: 'Launching soon — nothing is charged today.',
  },
];

const OWNER_TIERS: Tier[] = [
  {
    name: 'Free',
    price: '₹0',
    bullets: ['Listing & booking calendar', 'OTP check-in & no-show protection', 'Owner push alerts'],
    cta: 'Get started',
    note: 'Every salon on Trimly starts here — free, no catch.',
  },
  {
    name: 'Premium',
    price: '₹499–799/mo',
    bullets: ['Everything in Free', 'Busy-hours & repeat-customer analytics', 'Priority placement in search', 'More staff slots'],
    cta: 'Get started',
    note: "Launching soon — we're onboarding salons by hand right now. Contact us to join the waitlist.",
    highlight: true,
  },
  {
    name: 'Featured',
    price: '₹300–500/wk',
    bullets: ['A clearly labelled "Featured" boost slot', 'Separate from organic search ranking'],
    cta: 'Get started',
    note: "Launching soon — we're onboarding salons by hand right now. Contact us to join the waitlist.",
  },
];

/**
 * Shown per-role, not as a chooser: a customer only ever sees customer
 * pricing, a salon owner (or staff/admin) only ever sees salon pricing.
 * Logged-out visitors default to the customer view, since that's who
 * lands on the home page without an account yet.
 */
export default function PricingSection() {
  const [audience, setAudience] = useState<Audience>('customer');
  const [clicked, setClicked] = useState<string | null>(null);

  useEffect(() => {
    const user = getStoredUser<CurrentUser>();
    if (user?.role === 'OWNER' || user?.role === 'STAFF' || user?.role === 'ADMIN') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAudience('owner');
    }
  }, []);

  const tiers = audience === 'customer' ? CUSTOMER_TIERS : OWNER_TIERS;

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="text-center">
        <h2 className="text-xl font-bold sm:text-2xl">
          {audience === 'customer' ? 'Simple pricing for you' : 'Simple pricing for your salon'}
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          {audience === 'customer'
            ? "A preview of what's coming — nothing is charged today."
            : 'Built for salons, with no cost to get started.'}
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`flex flex-col rounded-2xl border p-5 shadow-premium ${
              tier.highlight ? 'border-brand bg-gradient-to-br from-brand-tint to-accent-tint' : 'border-border bg-surface'
            }`}
          >
            <h3 className="text-base font-bold">{tier.name}</h3>
            <p className="mt-1 text-2xl font-extrabold">{tier.price}</p>
            <ul className="mt-3 flex-1 space-y-1.5 text-sm text-muted">
              {tier.bullets.map((b) => (
                <li key={b} className="flex gap-1.5">
                  <span aria-hidden>✓</span>
                  {b}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setClicked(`${audience}-${tier.name}`)}
              className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:bg-brand-dark"
            >
              {tier.cta}
            </button>
            {clicked === `${audience}-${tier.name}` && <p className="mt-2 text-xs text-accent">{tier.note}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
