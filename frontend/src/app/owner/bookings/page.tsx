'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getStoredUser, getToken } from '@/lib/auth-client';
import { formatTime } from '@/lib/image';
import type { CurrentUser, OwnerBookingHistory } from '@/lib/types';

const STATUS_PILL: Record<string, string> = {
  CONFIRMED: 'bg-accent-tint text-accent',
  IN_PROGRESS: 'bg-violet-50 text-violet-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-neutral-100 text-muted',
  NO_SHOW: 'bg-red-50 text-red-700',
  PENDING: 'bg-amber-50 text-amber-700',
};

const PAGE_SIZE = 20;

export default function OwnerBookingHistoryPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [history, setHistory] = useState<OwnerBookingHistory | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = getStoredUser<CurrentUser>();
    const tok = getToken();
    if (!tok || stored?.role !== 'OWNER') {
      router.push('/login');
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage read, unavailable during SSR
    setToken(tok);
    apiFetch<{ id: string }[]>('/owner/businesses', { token: tok })
      .then((list) => setBusinessId(list[0]?.id ?? null))
      .catch(() => setError('Could not load your salon'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token || !businessId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the fetch below
    setLoading(true);
    apiFetch<OwnerBookingHistory>(`/owner/businesses/${businessId}/bookings?page=${page}&limit=${PAGE_SIZE}`, { token })
      .then((h) => setHistory((prev) => (page === 1 ? h : { ...h, bookings: [...(prev?.bookings ?? []), ...h.bookings] })))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load booking history'))
      .finally(() => setLoading(false));
  }, [token, businessId, page]);

  const hasMore = history ? history.page * history.limit < history.total : false;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 pb-24">
      <Link href="/owner" className="text-sm text-muted underline">
        ← Back
      </Link>
      <h1 className="mt-2 text-xl font-bold">Booking history</h1>
      <p className="mt-1 text-sm text-muted">
        Every booking your salon has ever had — {history?.total ?? '…'} total.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 space-y-2">
        {history?.bookings.map((b) => (
          <div key={b.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{b.customer.name}</p>
                <p className="text-muted">
                  {new Date(b.slotStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} ·{' '}
                  {formatTime(b.slotStart)}
                </p>
                <p className="text-muted">
                  {b.service.name}
                  {b.staff && <> · {b.staff.name}</>}
                  {b.serviceLocationType === 'HOME_SERVICE' && <> · 🏠 Home visit</>}
                </p>
                {b.address && <p className="text-xs text-muted">{b.address}</p>}
              </div>
              <div className="shrink-0 text-right">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_PILL[b.status] ?? 'bg-neutral-100 text-muted'}`}>
                  {b.status.replace('_', ' ')}
                </span>
                <p className="mt-1 text-sm font-semibold">₹{b.totalAmount}</p>
              </div>
            </div>
          </div>
        ))}
        {history && history.bookings.length === 0 && (
          <p className="rounded-xl border border-border bg-surface p-4 text-center text-sm text-muted">No bookings yet.</p>
        )}
      </div>

      {hasMore && (
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={loading}
          className="mt-4 w-full rounded-xl border border-border py-2.5 text-sm font-semibold hover:bg-brand-tint disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
