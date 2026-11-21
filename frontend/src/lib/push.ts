import { apiFetch } from './api';

/**
 * Web-push helpers for the browser. Flow: register /sw.js → ask permission
 * → subscribe with the API's VAPID public key → POST the subscription.
 * The API then pushes booking alerts (see backend common/push).
 */

export type PushState =
  | 'unsupported' // browser can't do web push at all
  | 'ios-needs-install' // iPhone/iPad: only works once added to the Home Screen
  | 'denied' // user blocked notifications for this site
  | 'off'
  | 'on';

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js');
}

export async function getPushState(token: string): Promise<PushState> {
  if (!supported()) return isIos() && !isStandalone() ? 'ios-needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub || Notification.permission !== 'granted') return 'off';
  // Make sure the server still knows this device for *this* account.
  const { subscribed } = await apiFetch<{ subscribed: boolean }>('/push/status', {
    method: 'POST',
    token,
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => ({ subscribed: false }));
  return subscribed ? 'on' : 'off';
}

export async function enablePush(token: string): Promise<PushState> {
  if (!supported()) return isIos() && !isStandalone() ? 'ios-needs-install' : 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const reg = await registration();
  await navigator.serviceWorker.ready;
  const { publicKey } = await apiFetch<{ publicKey: string }>('/push/public-key');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  }
  await apiFetch('/push/subscribe', { method: 'POST', token, body: JSON.stringify(sub.toJSON()) });
  return 'on';
}

export async function disablePush(token: string): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await apiFetch('/push/unsubscribe', { method: 'POST', token, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(
      () => {},
    );
    await sub.unsubscribe().catch(() => {});
  }
  return 'off';
}

export async function sendTestPush(token: string): Promise<number> {
  const { delivered } = await apiFetch<{ delivered: number }>('/push/test', { method: 'POST', token });
  return delivered;
}
