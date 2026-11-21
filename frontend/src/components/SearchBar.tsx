'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { saveLocation } from '@/lib/location';

const CATEGORIES = [
  { value: '', label: 'All', emoji: '✨' },
  { value: 'Men', label: 'Men', emoji: '💈' },
  { value: 'Women', label: 'Women', emoji: '💇‍♀️' },
  { value: 'Unisex', label: 'Unisex', emoji: '✂️' },
  { value: 'Spa', label: 'Spa', emoji: '🧖' },
];

export default function SearchBar({
  basePath = '/search',
  showTextInput = true,
  showFilters = true,
}: {
  basePath?: string;
  showTextInput?: boolean;
  showFilters?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const category = searchParams.get('category') ?? '';
  const openNow = searchParams.get('openNow') === 'true';

  function applyParams(overrides: Record<string, string | null>) {
    // No lat/lng injected here: when the URL has none, the page uses the
    // location saved by "Near me" (cookie) or the Mumbai fallback. Injecting
    // Mumbai here used to override a saved location as soon as a filter was tapped.
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null || value === '') params.delete(key);
      else params.set(key, value);
    }
    router.push(`${basePath}?${params.toString()}`);
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocationError("Your browser doesn't support location.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        saveLocation(pos.coords.latitude, pos.coords.longitude);
        applyParams({ lat: String(pos.coords.latitude), lng: String(pos.coords.longitude) });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocationError('Could not get your location. Allow location access in your browser and tap Near me again.');
      },
      { timeout: 8000 },
    );
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    applyParams({ q: q.trim() || null });
  }

  return (
    <div id="search" className="space-y-3">
      {showTextInput && (
        <form onSubmit={submitSearch} className="flex gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search salons by name…"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground active:scale-[0.98]"
          >
            Search
          </button>
        </form>
      )}

      {showFilters && (
        <>
          <div className="flex gap-2">
            <button
              onClick={useMyLocation}
              disabled={locating}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-foreground px-3.5 py-2.5 text-sm font-medium text-white active:scale-[0.98] disabled:opacity-50"
            >
              <span aria-hidden>📍</span>
              {locating ? 'Locating…' : 'Near me'}
            </button>
            <label className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={openNow}
                onChange={(e) => applyParams({ openNow: e.target.checked ? 'true' : null })}
                className="h-4 w-4 accent-brand"
              />
              Open now
            </label>
          </div>

          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => applyParams({ category: c.value || null })}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition ${
                  category === c.value
                    ? 'border-brand bg-brand-tint text-brand-dark'
                    : 'border-border bg-surface text-foreground hover:border-brand/40'
                }`}
              >
                <span aria-hidden>{c.emoji}</span>
                {c.label}
              </button>
            ))}
          </div>

          {locationError && <p className="text-xs text-amber-700">{locationError}</p>}
        </>
      )}
    </div>
  );
}
