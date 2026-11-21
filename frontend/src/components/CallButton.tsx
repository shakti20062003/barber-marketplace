'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth-client';

/**
 * Starts a free in-app voice call (WebRTC) with the other side of a booking
 * and opens the call screen. The other person is rung via push
 * notification; no phone numbers are used or shown.
 *
 * Problems ("the salon hasn't turned on notifications…") show as a floating
 * toast, never inline, so they can't squash the row the button sits in.
 */
export default function CallButton({ bookingId, label = 'Call', compact = false }: { bookingId: string; label?: string; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  async function call(e: React.MouseEvent) {
    e.stopPropagation();
    const token = getToken();
    if (!token || busy) return;
    setBusy(true);
    try {
      const { callId } = await apiFetch<{ callId: string }>('/calls', {
        method: 'POST',
        token,
        body: JSON.stringify({ bookingId }),
      });
      router.push(`/call/${callId}`);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'Could not start the call');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={call}
        disabled={busy}
        aria-label={label}
        title={label}
        className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-border bg-surface font-medium hover:bg-accent-tint disabled:opacity-50 ${
          compact ? 'h-8 w-8 text-sm' : 'px-3.5 py-1.5 text-sm'
        }`}
      >
        <span aria-hidden>{busy ? '…' : '📞'}</span>
        {!compact && (busy ? 'Calling…' : label)}
      </button>

      {toast && (
        <div
          role="status"
          onClick={(e) => {
            e.stopPropagation();
            setToast(null);
          }}
          className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-sm items-start gap-2 rounded-xl bg-foreground px-4 py-3 text-sm text-white shadow-lg sm:bottom-6"
        >
          <span aria-hidden>ℹ️</span>
          <span className="flex-1">{toast}</span>
          <span aria-hidden className="text-white/60">✕</span>
        </div>
      )}
    </>
  );
}
