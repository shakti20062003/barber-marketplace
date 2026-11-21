'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth-client';

/**
 * Masked call: the API asks the telephony provider to ring *this* user's
 * phone and then connect them to the other party. Neither side ever sees
 * the other's number.
 *
 * Feedback ("We're calling you now", "coming soon", errors) is shown as a
 * floating toast, NOT inline next to the button: inline text used to widen
 * whatever row the button sat in (e.g. the owner dashboard booking row) and
 * squash the rest of the layout.
 */
export default function CallButton({
  bookingId,
  label = 'Call',
  compact = false,
}: {
  bookingId: string;
  label?: string;
  compact?: boolean;
}) {
  const [calling, setCalling] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function call(e: React.MouseEvent) {
    e.stopPropagation();
    const token = getToken();
    if (!token || calling) return;
    setCalling(true);
    try {
      const res = await apiFetch<{ message: string }>(`/bookings/${bookingId}/call`, { method: 'POST', token });
      setToast({ text: res.message, ok: true });
    } catch (err) {
      setToast({ text: err instanceof ApiError ? err.message : 'Could not place the call', ok: false });
    } finally {
      setCalling(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={call}
        disabled={calling}
        aria-label={label}
        title={label}
        className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-border bg-surface font-medium hover:bg-accent-tint disabled:opacity-50 ${
          compact ? 'h-8 w-8 text-sm' : 'px-3.5 py-1.5 text-sm'
        }`}
      >
        <span aria-hidden>{calling ? '…' : '📞'}</span>
        {!compact && (calling ? 'Calling…' : label)}
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
          <span aria-hidden>{toast.ok ? '📞' : 'ℹ️'}</span>
          <span className="flex-1">{toast.text}</span>
          <span aria-hidden className="text-white/60">✕</span>
        </div>
      )}
    </>
  );
}
