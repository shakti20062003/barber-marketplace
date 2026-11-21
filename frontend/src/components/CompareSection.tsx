'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BusinessCard } from '@/lib/types';

/** Home-page entry point for comparing two salons side by side. */
export default function CompareSection({ salons }: { salons: BusinessCard[] }) {
  const router = useRouter();
  const [a, setA] = useState(salons[0]?.id ?? '');
  const [b, setB] = useState(salons[1]?.id ?? '');

  if (salons.length < 2) return null;

  const select = (value: string, onChange: (v: string) => void, other: string, label: string) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="w-full min-w-0 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
    >
      {salons.map((s) => (
        <option key={s.id} value={s.id} disabled={s.id === other}>
          {s.name}
        </option>
      ))}
    </select>
  );

  return (
    <section className="mt-8 rounded-2xl border border-border bg-gradient-to-br from-brand-tint to-accent-tint p-4">
      <h2 className="text-lg font-semibold">⚖️ Compare two salons</h2>
      <p className="mt-0.5 text-sm text-muted">Prices, ratings, hours and services — side by side.</p>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {select(a, setA, b, 'First salon')}
        <span className="text-xs font-bold text-muted">VS</span>
        {select(b, setB, a, 'Second salon')}
      </div>
      <button
        onClick={() => router.push(`/compare?a=${a}&b=${b}`)}
        disabled={!a || !b || a === b}
        className="mt-3 w-full rounded-xl bg-brand py-3 font-semibold text-brand-foreground disabled:opacity-50"
      >
        Compare
      </button>
    </section>
  );
}
