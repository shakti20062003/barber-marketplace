import { useCallback, useState, type SetStateAction } from 'react';
import { getToken } from './auth-client';

/**
 * In-memory cache for data the tab pages load in the browser (Styles,
 * My bookings, owner dashboard, account cards).
 *
 * Why: those pages fetched their data on every visit and started blank
 * ("Loading…"), so every bottom-tab switch showed the photos popping in
 * again. With this, returning to a tab renders the last data instantly;
 * the page's existing fetch then refreshes it quietly in the background.
 *
 * Lives only in memory (gone on reload), and is keyed per signed-in
 * account and wiped on sign-out (auth-client.clearSession), so one
 * account's data is never shown to another.
 */
const store = new Map<string, unknown>();

/** Key scoped to the signed-in account (if any). */
export function cacheKey(base: string): string {
  const token = getToken();
  return token ? `${base}:${token.slice(-16)}` : base;
}

export function clearClientCache() {
  store.clear();
}

/** Drop-in for useState whose value survives navigating away and back. */
export function useCachedState<T>(key: string, initial: T): [T, (next: SetStateAction<T>) => void] {
  const [value, setValue] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : initial));
  const set = useCallback(
    (next: SetStateAction<T>) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        store.set(key, resolved);
        return resolved;
      });
    },
    [key],
  );
  return [value, set];
}
