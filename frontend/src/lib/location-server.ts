import { cookies } from 'next/headers';
import {
  DEFAULT_RADIUS_KM,
  FALLBACK_LOCATION,
  LOCATION_COOKIE,
  RADIUS_COOKIE,
  parseLocation,
  parseRadius,
  type LocationSource,
} from './location';

/**
 * Server components: where to search from. An explicit ?lat=&lng= in the URL
 * wins; otherwise the location saved by "Near me"; otherwise Mumbai.
 */
export async function resolveSearchLocation(sp: Record<string, string | string[] | undefined>): Promise<{
  lat: string;
  lng: string;
  radiusKm: number;
  source: LocationSource;
}> {
  const jar = await cookies();
  const radiusKm =
    parseRadius(typeof sp.radiusKm === 'string' ? sp.radiusKm : null) ??
    parseRadius(jar.get(RADIUS_COOKIE)?.value) ??
    DEFAULT_RADIUS_KM;

  const fromUrl = typeof sp.lat === 'string' && typeof sp.lng === 'string' ? parseLocation(`${sp.lat},${sp.lng}`) : null;
  if (fromUrl) return { lat: String(fromUrl.lat), lng: String(fromUrl.lng), radiusKm, source: 'url' };

  const saved = parseLocation(jar.get(LOCATION_COOKIE)?.value);
  if (saved) return { lat: String(saved.lat), lng: String(saved.lng), radiusKm, source: 'saved' };

  return { lat: String(FALLBACK_LOCATION.lat), lng: String(FALLBACK_LOCATION.lng), radiusKm, source: 'fallback' };
}
