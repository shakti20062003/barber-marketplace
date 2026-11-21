'use client';

import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth-client';

/**
 * Masked call: the API asks the telephony provider to ring *this* user's
 * phone and then connect them to the other party. Neither side ever sees
 * the other's number.
 */
export default function CallButton({ bookingId, label = 'Call', compact = false }: { bookingId: string; label?: string; compact?: boolean }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function call(e: React.MouseEvent) {
    e.stopPropagation();
    const token = getToken();
    if (!token) return;
    setState('busy');
    setMessage(null);
    try {
      const res = await apiFetch<{ message: string }>(`/bookings/${bookingId}/call`, { method: 'POST', token });
      setMessage(res.message);
      setState('done');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not place the call');
      setState('idle');
    }
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={call}
        disabled={state === 'busy'}
        aria-label={label}
        className={`inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-surface font-medium hover:bg-accent-tint disabled:opacity-50 ${
          compact ? 'h-8 w-8 text-sm' : 'px-3.5 py-1.5 text-sm'
        }`}
      >
        <span aria-hidden>📞</span>
        {!compact && (state === 'busy' ? 'Calling…' : label)}
      </button>
      {message && <span className="mt-1 max-w-[14rem] text-xs text-muted">{message}</span>}
    </span>
  );
}
