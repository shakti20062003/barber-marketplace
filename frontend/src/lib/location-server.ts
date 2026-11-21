import { cookies } from 'next/headers';
import { FALLBACK_LOCATION, LOCATION_COOKIE, parseLocation, type LocationSource } from './location';

/**
 * Server components: where to search from. An explicit ?lat=&lng= in the URL
 * wins; otherwise the location saved by "Near me"; otherwise Mumbai.
 */
export async function resolveSearchLocation(sp: Record<string, string | string[] | undefined>): Promise<{
  lat: string;
  lng: string;
  source: LocationSource;
}> {
  const fromUrl = typeof sp.lat === 'string' && typeof sp.lng === 'string' ? parseLocation(`${sp.lat},${sp.lng}`) : null;
  if (fromUrl) return { lat: String(fromUrl.lat), lng: String(fromUrl.lng), source: 'url' };

  const saved = parseLocation((await cookies()).get(LOCATION_COOKIE)?.value);
  if (saved) return { lat: String(saved.lat), lng: String(saved.lng), source: 'saved' };

  return { lat: String(FALLBACK_LOCATION.lat), lng: String(FALLBACK_LOCATION.lng), source: 'fallback' };
}
