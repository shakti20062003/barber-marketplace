/**
 * The customer's chosen search location ("Near me"), remembered across
 * pages. It used to live only in the URL (?lat=&lng=), so tapping the Home
 * tab (a plain "/") dropped it and the list fell back to Mumbai until
 * "Near me" was tapped again.
 *
 * Stored as a cookie (not localStorage) because Home and Search are server
 * components: the server needs the location to fetch the right salons.
 */
export const LOCATION_COOKIE = 'trimly_loc';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Mumbai — used until the customer shares a location (PRD §3.1 fallback).
export const FALLBACK_LOCATION = { lat: 19.076, lng: 72.8777 };

export type LocationSource = 'url' | 'saved' | 'fallback';

/** "Salons within X km" — customer-chosen, remembered like the location. */
export const RADIUS_COOKIE = 'trimly_radius';
export const RADIUS_OPTIONS = [2, 5, 7, 10, 15] as const;
export const DEFAULT_RADIUS_KM = 7;

export function parseRadius(value: string | undefined | null): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && n <= 50 ? n : null;
}

/** Browser only. */
export function saveRadius(km: number) {
  document.cookie = `${RADIUS_COOKIE}=${km}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

/** "19.0760,72.8777" → coordinates, or null if missing / malformed. */
export function parseLocation(value: string | undefined | null): { lat: number; lng: number } | null {
  if (!value) return null;
  const [lat, lng] = decodeURIComponent(value).split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** Browser only: remember the location for the next visit to Home/Search. */
export function saveLocation(lat: number, lng: number) {
  // ~10 m precision is plenty for "salons near me".
  const value = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  document.cookie = `${LOCATION_COOKIE}=${encodeURIComponent(value)}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}
