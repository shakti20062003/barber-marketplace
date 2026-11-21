import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import type { SearchResponse } from '@/lib/types';
import BusinessCard from '@/components/BusinessCard';
import SearchBar from '@/components/SearchBar';
import CompareSection from '@/components/CompareSection';

import { resolveSearchLocation } from '@/lib/location-server';
import { RADIUS_OPTIONS } from '@/lib/location';

export default async function Page(props: PageProps<'/'>) {
  const sp = await props.searchParams;
  const location = await resolveSearchLocation(sp);
  const params = new URLSearchParams();
  params.set('lat', location.lat);
  params.set('lng', location.lng);
  params.set('radiusKm', String(location.radiusKm));
  const widerRadius = RADIUS_OPTIONS.find((km) => km > location.radiusKm);
  const widenParams = new URLSearchParams(params);
  if (widerRadius) widenParams.set('radiusKm', String(widerRadius));
  widenParams.delete('limit');
  if (sp.category) params.set('category', sp.category as string);
  if (sp.openNow) params.set('openNow', sp.openNow as string);
  params.set('limit', '6');

  let data: SearchResponse | null = null;
  let error: string | null = null;
  try {
    data = await apiFetch<SearchResponse>(`/search/businesses?${params.toString()}`, {
      cache: 'no-store',
    });
  } catch {
    error = 'Could not reach the Trimly API. Is the backend running?';
  }

  // Carry whatever filters are active on the home preview through to the
  // full search page, so "Explore more" doesn't lose context.
  const exploreParams = new URLSearchParams(params);
  exploreParams.delete('limit');

  return (
    <div className="flex flex-1 flex-col">
      <section className="bg-foreground px-4 pb-6 pt-8 text-white sm:pb-8 sm:pt-12">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-2xl font-bold sm:text-3xl">Find a salon near you</h1>
          <p className="mt-1 text-sm text-white/70">Guaranteed slots. Transparent pricing. No surprises.</p>
          <Link
            href="/search"
            className="mt-4 flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm text-muted shadow-sm"
          >
            <span aria-hidden>🔍</span>
            Search salons by name, category or location…
          </Link>
        </div>
      </section>

      <section className="border-b border-border bg-surface px-4 py-4">
        <div className="mx-auto max-w-5xl">
          <SearchBar basePath="/" showTextInput={false} radiusKm={location.radiusKm} />
        </div>
      </section>

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">✨ Featured near you</h2>
            <p className="truncate text-xs text-muted">
              {location.source === 'fallback'
                ? `Mumbai · within ${location.radiusKm} km · tap 📍 Near me for your area`
                : `📍 Within ${location.radiusKm} km of you`}
            </p>
          </div>
          <Link
            href={`/search?${exploreParams.toString()}`}
            className="shrink-0 rounded-full bg-brand-tint px-3.5 py-1.5 text-sm font-semibold text-brand-dark"
          >
            Explore more →
          </Link>
        </div>

        {error && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>
        )}

        {data && data.relaxedFilters && data.relaxedFilters.length > 0 && (
          <p className="mb-3 text-sm text-muted">
            No exact matches — showing nearby results with relaxed filters ({data.relaxedFilters.join(', ')}).
          </p>
        )}

        {data && data.results.length === 0 && !error && (
          <div className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted">
            No salons within {location.radiusKm} km yet.
            {widerRadius && (
              <>
                <br />
                <Link
                  href={`/?${widenParams.toString()}`}
                  className="mt-3 inline-block rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
                >
                  Search within {widerRadius} km
                </Link>
              </>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {data?.results.map((business) => <BusinessCard key={business.id} business={business} />)}
        </div>

        {data && <CompareSection salons={data.results} />}
      </div>
    </div>
  );
}
