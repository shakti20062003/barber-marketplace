'use client';

import { useEffect, useState } from 'react';
import { getToken } from '@/lib/auth-client';
import { disablePush, enablePush, getPushState, sendTestPush, type PushState } from '@/lib/push';

/** Owner dashboard card: turn on push notifications for new bookings. */
export default function BookingAlerts() {
  const [state, setState] = useState<PushState | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    getPushState(token)
      .then(setState)
      .catch(() => setState('off'));
  }, []);

  async function run(action: (token: string) => Promise<PushState>) {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setMessage(null);
    try {
      setState(await action(token));
    } catch {
      setMessage('Could not change notification settings. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setMessage(null);
    try {
      const n = await sendTestPush(token);
      setMessage(n > 0 ? 'Test sent — you should see it in a few seconds.' : 'Could not deliver to this phone. Try turning alerts off and on again.');
    } catch {
      setMessage('Could not send a test right now.');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return null;

  return (
    <div
      className={`mt-4 rounded-xl border p-4 ${
        state === 'on' ? 'border-emerald-200 bg-emerald-50' : 'border-brand/30 bg-brand-tint/50'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>
          {state === 'on' ? '🔔' : '🔕'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{state === 'on' ? 'Booking alerts are on' : 'Get notified about new bookings'}</p>

          {state === 'on' && (
            <p className="text-sm text-muted">
              This phone gets a notification for every new booking, time change, cancellation and added service.
            </p>
          )}
          {state === 'off' && (
            <p className="text-sm text-muted">
              Get a notification on this phone the moment a customer books, changes or cancels — even when Trimly is closed.
            </p>
          )}
          {state === 'denied' && (
            <p className="text-sm text-muted">
              Notifications are blocked for Trimly in this browser. Open your browser&apos;s site settings for Trimly, allow
              notifications, then come back here.
            </p>
          )}
          {state === 'ios-needs-install' && (
            <p className="text-sm text-muted">
              On iPhone, alerts work once Trimly is on your Home Screen: tap <b>Share</b> → <b>Add to Home Screen</b>, open
              Trimly from the new icon, log in, and tap “Turn on alerts” here.
            </p>
          )}
          {state === 'unsupported' && (
            <p className="text-sm text-muted">
              This browser can&apos;t show notifications. Use Chrome on Android, or Safari on iPhone (added to Home Screen).
            </p>
          )}

          <div className="mt-2 flex flex-wrap gap-2">
            {state === 'off' && (
              <button
                onClick={() => run(enablePush)}
                disabled={busy}
                className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-50"
              >
                {busy ? 'Turning on…' : 'Turn on alerts'}
              </button>
            )}
            {state === 'on' && (
              <>
                <button
                  onClick={test}
                  disabled={busy}
                  className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium disabled:opacity-50"
                >
                  Send a test
                </button>
                <button onClick={() => run(disablePush)} disabled={busy} className="text-xs text-muted underline">
                  Turn off
                </button>
              </>
            )}
          </div>
          {message && <p className="mt-2 text-xs text-muted">{message}</p>}
        </div>
      </div>
    </div>
  );
}
