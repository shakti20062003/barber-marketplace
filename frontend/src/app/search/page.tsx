import { apiFetch } from '@/lib/api';
import type { SearchResponse } from '@/lib/types';
import SearchBar from '@/components/SearchBar';
import BusinessCard from '@/components/BusinessCard';

import Link from 'next/link';
import { resolveSearchLocation } from '@/lib/location-server';
import { RADIUS_OPTIONS } from '@/lib/location';

export default async function SearchPage(props: PageProps<'/search'>) {
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
  if (sp.q) params.set('q', sp.q as string);

  let data: SearchResponse | null = null;
  let error: string | null = null;
  try {
    data = await apiFetch<SearchResponse>(`/search/businesses?${params.toString()}`, {
      cache: 'no-store',
    });
  } catch {
    error = 'Could not reach the Trimly API. Is the backend running?';
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-5xl px-4 py-4">
        <h1 className="text-lg font-bold">Search salons</h1>
        <div className="mt-3">
          <SearchBar radiusKm={location.radiusKm} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 pb-5">
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
                  href={`/search?${widenParams.toString()}`}
                  className="mt-3 inline-block rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
                >
                  Search within {widerRadius} km
                </Link>
              </>
            )}
          </div>
        )}

        {data && data.results.length > 0 && (
          <p className="mb-3 text-sm font-medium text-muted">
            {data.total} salon{data.total === 1 ? '' : 's'} within {location.radiusKm} km
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {data?.results.map((business) => <BusinessCard key={business.id} business={business} />)}
        </div>
      </div>
    </div>
  );
}
