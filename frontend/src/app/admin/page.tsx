'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { clearSession, getStoredUser, getToken } from '@/lib/auth-client';
import type { AdminStats, CurrentUser, PendingBusiness } from '@/lib/types';

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-50">{value}</p>
    </div>
  );
}

function PendingCard({
  business,
  busy,
  onDecide,
}: {
  business: PendingBusiness;
  busy: boolean;
  onDecide: (decision: 'VERIFIED' | 'REJECTED', reason?: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-50">{business.name}</p>
          <p className="text-sm text-slate-400">
            {business.category} · {business.city.name}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Owner: {business.owner.name} · {business.owner.phone ?? business.owner.email ?? 'no contact'}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-1 text-xs font-medium text-amber-300">
          {new Date(business.createdAt).toLocaleDateString()}
        </span>
      </div>

      {business.description && <p className="mt-2 text-sm text-slate-300">{business.description}</p>}

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
        <span>{business.media.length} photo{business.media.length === 1 ? '' : 's'}</span>
        <span>{business.services.length} service{business.services.length === 1 ? '' : 's'}</span>
        <span>{business.staff.length} staff</span>
      </div>

      {business.media.length > 0 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto">
          {business.media.slice(0, 6).map((m) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={m.id} src={m.url} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
          ))}
        </div>
      )}

      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Rejection reason (optional)"
        className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => onDecide('VERIFIED')}
          disabled={busy}
          className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          Verify
        </button>
        <button
          onClick={() => onDecide('REJECTED', reason || undefined)}
          disabled={busy}
          className="flex-1 rounded-lg bg-red-600/90 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pending, setPending] = useState<PendingBusiness[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload(token: string) {
    apiFetch<AdminStats>('/admin/stats', { token }).then(setStats).catch(() => {});
    apiFetch<PendingBusiness[]>('/admin/businesses/pending', { token }).then(setPending).catch(() => setPending([]));
  }

  useEffect(() => {
    const stored = getStoredUser<CurrentUser>();
    const token = getToken();
    if (!token || stored?.role !== 'ADMIN') {
      router.push('/login');
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage read, unavailable during SSR
    setUser(stored);
    reload(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide(businessId: string, decision: 'VERIFIED' | 'REJECTED', reason?: string) {
    const token = getToken();
    if (!token) return;
    setBusyId(businessId);
    setError(null);
    try {
      await apiFetch(`/admin/businesses/${businessId}/verify`, {
        method: 'POST',
        token,
        body: JSON.stringify({ decision, reason }),
      });
      reload(token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record decision');
    } finally {
      setBusyId(null);
    }
  }

  if (!user) return <div className="flex min-h-screen items-center justify-center bg-slate-900 text-sm text-slate-400">Loading…</div>;

  return (
    <div className="min-h-screen bg-slate-900 font-mono text-slate-100">
      <div className="border-b border-slate-800 bg-slate-950">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-indigo-500 text-xs font-bold text-white">
              A
            </span>
            <span className="text-sm font-bold uppercase tracking-widest text-slate-300">Trimly Admin Console</span>
          </div>
          <button
            onClick={() => {
              clearSession();
              router.push('/');
            }}
            className="rounded border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6">
        <p className="text-xs text-slate-500">Signed in as {user.name}</p>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          <StatTile label="Pending" value={stats?.pendingCount ?? 0} />
          <StatTile label="Verified" value={stats?.verifiedCount ?? 0} />
          <StatTile label="Rejected" value={stats?.rejectedCount ?? 0} />
          <StatTile label="Customers" value={stats?.customerCount ?? 0} />
          <StatTile label="Owners" value={stats?.ownerCount ?? 0} />
          <StatTile label="Bookings" value={stats?.bookingCount ?? 0} />
        </div>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-slate-400">
          Verification queue {pending ? `(${pending.length})` : ''}
        </h2>
        <div className="mt-3 space-y-3">
          {pending?.map((b) => (
            <PendingCard
              key={b.id}
              business={b}
              busy={busyId === b.id}
              onDecide={(decision, reason) => decide(b.id, decision, reason)}
            />
          ))}
          {pending && pending.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-700 py-8 text-center text-sm text-slate-500">
              Nothing waiting on review. New salon listings will show up here.
            </p>
          )}
          {pending === null && <p className="text-sm text-slate-500">Loading…</p>}
        </div>
      </div>
    </div>
  );
}
