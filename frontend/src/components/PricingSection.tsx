'use client';

import { useState } from 'react';

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

export default function PricingSection() {
  const [audience, setAudience] = useState<Audience>('customer');
  const [clicked, setClicked] = useState<string | null>(null);
  const tiers = audience === 'customer' ? CUSTOMER_TIERS : OWNER_TIERS;

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="text-center">
        <h2 className="text-xl font-bold sm:text-2xl">Simple pricing</h2>
        <p className="mt-1 text-sm text-muted">
          Built for salons today — and soon, for customers who book often.
        </p>
      </div>

      <div className="mx-auto mt-5 flex w-fit rounded-full border border-border bg-surface p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setAudience('customer')}
          className={`rounded-full px-4 py-1.5 ${audience === 'customer' ? 'bg-brand text-brand-foreground' : 'text-muted'}`}
        >
          For customers
        </button>
        <button
          type="button"
          onClick={() => setAudience('owner')}
          className={`rounded-full px-4 py-1.5 ${audience === 'owner' ? 'bg-brand text-brand-foreground' : 'text-muted'}`}
        >
          For salon owners
        </button>
      </div>

      {audience === 'customer' && (
        <p className="mx-auto mt-3 max-w-md text-center text-xs text-muted">
          Customer plans are a preview of what&apos;s coming — nothing is charged today.
        </p>
      )}

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
