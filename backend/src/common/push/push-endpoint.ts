/**
 * Push endpoints come from the browser, and the server then POSTs to them —
 * so an unchecked endpoint is an SSRF hole (a user could make our server
 * call internal addresses, e.g. Redis on Render's private network or cloud
 * metadata). Only real browser push services over https are accepted.
 */
const PUSH_HOSTS = [
  'fcm.googleapis.com', // Chrome, Edge (Chromium), Samsung, Android
  'updates.push.services.mozilla.com', // Firefox
  'push.services.mozilla.com',
  'web.push.apple.com', // Safari / iOS home-screen apps
];
const PUSH_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com'];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  // Test-only escape hatch for local end-to-end tests with a fake push
  // service. Never set this in production.
  if (process.env.PUSH_ALLOW_ANY_ENDPOINT === 'true') return true;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((s) => host.endsWith(s));
}
