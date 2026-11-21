'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { formatHhmm } from '@/lib/image';
import type { BusinessCard, BusinessDetail, SearchResponse } from '@/lib/types';

function avgRating(b: BusinessDetail): number | null {
  if (b.reviews.length === 0) return null;
  return Math.round((b.reviews.reduce((s, r) => s + r.rating, 0) / b.reviews.length) * 10) / 10;
}

function priceRange(b: BusinessDetail): string {
  if (b.services.length === 0) return '—';
  const prices = b.services.map((s) => Number(s.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `₹${min}` : `₹${min} – ₹${max}`;
}

function openDays(b: BusinessDetail): number {
  return Object.values(b.workingHours ?? {}).filter((d) => !d.closed).length;
}

type Winner = 'a' | 'b' | null;

/** Which side wins a numeric row (higher or lower is better), or null for a tie / missing data. */
function better(a: number | null, b: number | null, higherIsBetter: boolean): Winner {
  if (a == null || b == null || a === b) return null;
  return (a > b) === higherIsBetter ? 'a' : 'b';
}

function Row({ label, a, b, winner }: { label: string; a: React.ReactNode; b: React.ReactNode; winner?: Winner }) {
  const cell = (side: 'a' | 'b', content: React.ReactNode) => (
    <div className={`px-3 py-2.5 text-sm ${winner === side ? 'bg-emerald-50 font-semibold text-emerald-800' : ''}`}>
      {content}
      {winner === side && <span className="ml-1 text-xs">✓</span>}
    </div>
  );
  return (
    <>
      <div className="col-span-2 bg-neutral-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </div>
      {cell('a', a)}
      {cell('b', b)}
    </>
  );
}

function ComparePageInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const aId = sp.get('a') ?? '';
  const bId = sp.get('b') ?? '';
  const [a, setA] = useState<BusinessDetail | null>(null);
  const [b, setB] = useState<BusinessDetail | null>(null);
  const [options, setOptions] = useState<BusinessCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      aId ? apiFetch<BusinessDetail>(`/businesses/${aId}`) : Promise.resolve(null),
      bId ? apiFetch<BusinessDetail>(`/businesses/${bId}`) : Promise.resolve(null),
    ])
      .then(([x, y]) => {
        setA(x);
        setB(y);
        const anchor = x ?? y;
        if (anchor) {
          return apiFetch<SearchResponse>(`/search/businesses?lat=${anchor.lat}&lng=${anchor.lng}&radiusKm=50&limit=50`).then(
            (r) => setOptions(r.results),
          );
        }
      })
      .catch(() => setError('Could not load one of these salons.'));
  }, [aId, bId]);

  function swap(side: 'a' | 'b', id: string) {
    const next = new URLSearchParams({ a: side === 'a' ? id : aId, b: side === 'b' ? id : bId });
    router.replace(`/compare?${next.toString()}`);
  }

  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!a || !b) return <div className="p-6 text-sm text-muted">Loading comparison…</div>;

  const ra = avgRating(a);
  const rb = avgRating(b);
  const minA = a.services.length ? Math.min(...a.services.map((s) => Number(s.price))) : null;
  const minB = b.services.length ? Math.min(...b.services.map((s) => Number(s.price))) : null;

  // Services both salons offer (matched by name), for a like-for-like price check.
  const shared = a.services
    .map((sa) => ({ sa, sb: b.services.find((sb) => sb.name.trim().toLowerCase() === sa.name.trim().toLowerCase()) }))
    .filter((x): x is { sa: (typeof a.services)[number]; sb: (typeof b.services)[number] } => !!x.sb);

  const picker = (side: 'a' | 'b', current: BusinessDetail, other: string) => (
    <select
      value={current.id}
      onChange={(e) => swap(side, e.target.value)}
      className="w-full min-w-0 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs"
      aria-label={side === 'a' ? 'Change first salon' : 'Change second salon'}
    >
      {!options.some((o) => o.id === current.id) && <option value={current.id}>{current.name}</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id} disabled={o.id === other}>
          {o.name}
        </option>
      ))}
    </select>
  );

  const header = (biz: BusinessDetail, side: 'a' | 'b', other: string) => (
    <div className="p-3">
      <div className="aspect-[4/3] overflow-hidden rounded-lg bg-neutral-100">
        {biz.media[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={biz.media[0].url} alt={biz.name} className="h-full w-full object-cover" />
        )}
      </div>
      <p className="mt-2 line-clamp-2 font-semibold leading-tight">{biz.name}</p>
      <p className="text-xs text-muted">
        {biz.category} · {biz.city.name}
      </p>
      <div className="mt-2">{picker(side, biz, other)}</div>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-24">
      <Link href="/" className="text-sm text-muted underline">
        ← Back
      </Link>
      <h1 className="mt-2 text-xl font-bold">Compare salons</h1>

      <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="border-r border-border">{header(a, 'a', b.id)}</div>
        <div>{header(b, 'b', a.id)}</div>

        <Row
          label="Rating"
          a={ra != null ? `★ ${ra} (${a.reviews.length})` : 'New'}
          b={rb != null ? `★ ${rb} (${b.reviews.length})` : 'New'}
          winner={better(ra, rb, true)}
        />
        <Row label="Starting price" a={minA != null ? `₹${minA}` : '—'} b={minB != null ? `₹${minB}` : '—'} winner={better(minA, minB, false)} />
        <Row label="Price range" a={priceRange(a)} b={priceRange(b)} />
        <Row
          label="Right now"
          a={a.openNow ? '● Open' : 'Closed'}
          b={b.openNow ? '● Open' : 'Closed'}
          winner={a.openNow === b.openNow ? null : a.openNow ? 'a' : 'b'}
        />
        <Row
          label="Today's hours"
          a={a.todayHours ? `${formatHhmm(a.todayHours.open)}–${formatHhmm(a.todayHours.close)}` : 'Closed'}
          b={b.todayHours ? `${formatHhmm(b.todayHours.open)}–${formatHhmm(b.todayHours.close)}` : 'Closed'}
        />
        <Row label="Open days / week" a={openDays(a)} b={openDays(b)} winner={better(openDays(a), openDays(b), true)} />
        <Row label="Services" a={a.services.length} b={b.services.length} winner={better(a.services.length, b.services.length, true)} />
        <Row label="Stylists" a={a.staff.length} b={b.staff.length} winner={better(a.staff.length, b.staff.length, true)} />
        <Row
          label="Badges"
          a={a.trustBadges.map((t) => t.badgeType.replace('_', ' ').toLowerCase()).join(', ') || '—'}
          b={b.trustBadges.map((t) => t.badgeType.replace('_', ' ').toLowerCase()).join(', ') || '—'}
        />

        {shared.length > 0 && (
          <>
            <div className="col-span-2 border-t border-border bg-brand-tint px-3 py-2 text-sm font-semibold text-brand-dark">
              Same service, both salons
            </div>
            {shared.map(({ sa, sb }) => (
              <Row
                key={sa.id}
                label={sa.name}
                a={`₹${sa.price} · ${sa.durationMinutes} min`}
                b={`₹${sb.price} · ${sb.durationMinutes} min`}
                winner={better(Number(sa.price), Number(sb.price), false)}
              />
            ))}
          </>
        )}

        <div className="border-r border-t border-border p-3">
          <Link
            href={`/salons/${a.id}`}
            className="block rounded-xl bg-brand py-2.5 text-center text-sm font-semibold text-brand-foreground"
          >
            View & book
          </Link>
        </div>
        <div className="border-t border-border p-3">
          <Link
            href={`/salons/${b.id}`}
            className="block rounded-xl bg-brand py-2.5 text-center text-sm font-semibold text-brand-foreground"
          >
            View & book
          </Link>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">✓ marks the better value in each row.</p>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted">Loading comparison…</div>}>
      <ComparePageInner />
    </Suspense>
  );
}
