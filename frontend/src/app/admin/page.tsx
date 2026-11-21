'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { clearSession, getStoredUser, getToken } from '@/lib/auth-client';
import type { AdminStats, CurrentUser, PendingBusiness } from '@/lib/types';

type View = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'CUSTOMERS' | 'OWNERS' | 'BOOKINGS';

interface AdminBusiness extends PendingBusiness {
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  _count: { bookings: number; reviews: number };
}

interface AdminUser {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
  customerProfile: { reliabilityScore: string; noShowCountRolling: number } | null;
  businesses: { id: string; name: string; verificationStatus: string }[];
  _count: { bookingsAsCustomer: number };
}

interface AdminBooking {
  id: string;
  slotStart: string;
  status: string;
  business: { id: string; name: string };
  customer: { name: string };
  service: { name: string };
  payment: { amount: string; status: string } | null;
}

const TILES: { view: View; label: string; key: keyof AdminStats }[] = [
  { view: 'PENDING', label: 'Pending', key: 'pendingCount' },
  { view: 'VERIFIED', label: 'Verified', key: 'verifiedCount' },
  { view: 'REJECTED', label: 'Rejected', key: 'rejectedCount' },
  { view: 'CUSTOMERS', label: 'Customers', key: 'customerCount' },
  { view: 'OWNERS', label: 'Owners', key: 'ownerCount' },
  { view: 'BOOKINGS', label: 'Bookings', key: 'bookingCount' },
];

const VIEW_TITLE: Record<View, string> = {
  PENDING: 'Verification queue',
  VERIFIED: 'Verified salons',
  REJECTED: 'Rejected salons',
  CUSTOMERS: 'Customers',
  OWNERS: 'Salon owners',
  BOOKINGS: 'Recent bookings',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function BusinessCard({
  business,
  busy,
  onDecide,
}: {
  business: AdminBusiness;
  busy: boolean;
  onDecide: (decision: 'VERIFIED' | 'REJECTED', reason?: string) => void;
}) {
  const [open, setOpen] = useState(business.verificationStatus === 'PENDING');
  const [reason, setReason] = useState('');

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start justify-between gap-3 p-4 text-left">
        <div className="min-w-0">
          <p className="font-semibold text-slate-50">{business.name}</p>
          <p className="text-sm text-slate-400">
            {business.category} · {business.city.name}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Owner: {business.owner.name} · {business.owner.phone ?? business.owner.email ?? 'no contact'}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="rounded-full bg-slate-700 px-2 py-1 text-xs text-slate-300">{fmtDate(business.createdAt)}</span>
          <p className="mt-2 text-xs text-slate-500">{open ? '▲' : '▼'}</p>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-700 p-4 pt-3">
          {business.description && <p className="text-sm text-slate-300">{business.description}</p>}

          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
            <span>{business.media.length} photos</span>
            <span>{business.services.length} services</span>
            <span>{business.staff.length} staff</span>
            <span>{business._count.bookings} bookings</span>
            <span>{business._count.reviews} reviews</span>
          </div>

          {business.media.length > 0 && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto">
              {business.media.slice(0, 8).map((m) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={m.id} src={m.url} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
              ))}
            </div>
          )}

          {business.services.length > 0 && (
            <div className="mt-3 rounded-lg border border-slate-700 text-sm">
              {business.services.map((s) => (
                <div key={s.id} className="flex justify-between border-b border-slate-700 px-3 py-1.5 last:border-0">
                  <span className="text-slate-300">{s.name}</span>
                  <span className="text-slate-400">₹{s.price}</span>
                </div>
              ))}
            </div>
          )}

          {business.staff.length > 0 && (
            <p className="mt-2 text-xs text-slate-400">Staff: {business.staff.map((s) => s.name).join(', ')}</p>
          )}

          {business.verificationStatus === 'VERIFIED' && (
            <Link href={`/salons/${business.id}`} className="mt-3 inline-block text-sm text-indigo-300 underline">
              Open public salon page →
            </Link>
          )}

          {business.verificationStatus !== 'VERIFIED' && (
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Rejection reason (optional)"
              className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
            />
          )}
          <div className="mt-2 flex gap-2">
            {business.verificationStatus !== 'VERIFIED' && (
              <button
                onClick={() => onDecide('VERIFIED')}
                disabled={busy}
                className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Verify
              </button>
            )}
            {business.verificationStatus !== 'REJECTED' && (
              <button
                onClick={() => onDecide('REJECTED', reason || undefined)}
                disabled={busy}
                className="flex-1 rounded-lg bg-red-600/90 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {business.verificationStatus === 'VERIFIED' ? 'Unlist (reject)' : 'Reject'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UserRow({ user, kind }: { user: AdminUser; kind: 'CUSTOMERS' | 'OWNERS' }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-700 px-4 py-3 last:border-0">
      <div className="min-w-0">
        <p className="font-medium text-slate-100">{user.name}</p>
        <p className="text-xs text-slate-400">{user.phone ?? user.email ?? '—'}</p>
        {kind === 'OWNERS' && user.businesses.length > 0 && (
          <p className="mt-0.5 text-xs text-slate-500">
            {user.businesses.map((b) => `${b.name} (${b.verificationStatus.toLowerCase()})`).join(', ')}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right text-xs text-slate-400">
        <p>Joined {fmtDate(user.createdAt)}</p>
        {kind === 'CUSTOMERS' && (
          <p>
            {user._count.bookingsAsCustomer} bookings
            {user.customerProfile && <> · ⭐ {user.customerProfile.reliabilityScore}</>}
          </p>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [view, setView] = useState<View>('PENDING');
  const [businesses, setBusinesses] = useState<AdminBusiness[] | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadView(token: string, v: View) {
    setError(null);
    if (v === 'PENDING' || v === 'VERIFIED' || v === 'REJECTED') {
      setBusinesses(null);
      apiFetch<AdminBusiness[]>(`/admin/businesses?status=${v}`, { token })
        .then(setBusinesses)
        .catch(() => setBusinesses([]));
    } else if (v === 'CUSTOMERS' || v === 'OWNERS') {
      setUsers(null);
      apiFetch<AdminUser[]>(`/admin/users?role=${v === 'CUSTOMERS' ? 'CUSTOMER' : 'OWNER'}`, { token })
        .then(setUsers)
        .catch(() => setUsers([]));
    } else {
      setBookings(null);
      apiFetch<AdminBooking[]>('/admin/bookings', { token })
        .then(setBookings)
        .catch(() => setBookings([]));
    }
  }

  function reloadStats(token: string) {
    apiFetch<AdminStats>('/admin/stats', { token }).then(setStats).catch(() => {});
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
    reloadStats(token);
    loadView(token, 'PENDING');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectView(v: View) {
    const token = getToken();
    if (!token) return;
    setView(v);
    setQuery('');
    loadView(token, v);
  }

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
      reloadStats(token);
      loadView(token, view);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record decision');
    } finally {
      setBusyId(null);
    }
  }

  if (!user) return <div className="flex min-h-screen items-center justify-center bg-slate-900 text-sm text-slate-400">Loading…</div>;

  const q = query.trim().toLowerCase();
  const matches = (...fields: (string | null | undefined)[]) => !q || fields.some((f) => f?.toLowerCase().includes(q));
  const isBusinessView = view === 'PENDING' || view === 'VERIFIED' || view === 'REJECTED';
  const isUserView = view === 'CUSTOMERS' || view === 'OWNERS';
  const list = isBusinessView ? businesses : isUserView ? users : bookings;

  return (
    <div className="min-h-screen bg-slate-900 font-mono text-slate-100">
      <div className="border-b border-slate-800 bg-slate-950">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-indigo-500 text-xs font-bold text-white">A</span>
            <span className="text-sm font-bold uppercase tracking-widest text-slate-300">Trimly Admin</span>
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
        <p className="text-xs text-slate-500">Signed in as {user.name} · tap a box to see its list</p>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {TILES.map((t) => (
            <button
              key={t.view}
              onClick={() => selectView(t.view)}
              className={`rounded-lg border p-3 text-left transition ${
                view === t.view
                  ? 'border-indigo-400 bg-indigo-500/20 ring-1 ring-indigo-400'
                  : 'border-slate-700 bg-slate-800/60 hover:border-slate-500'
              }`}
            >
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{t.label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-50">{stats?.[t.key] ?? 0}</p>
            </button>
          ))}
        </div>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <div className="mt-6 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
            {VIEW_TITLE[view]} {list ? `(${list.length})` : ''}
          </h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-36 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 sm:w-56"
          />
        </div>

        <div className="mt-3">
          {list === null && <p className="text-sm text-slate-500">Loading…</p>}

          {isBusinessView && businesses && (
            <div className="space-y-3">
              {businesses
                .filter((b) => matches(b.name, b.city.name, b.owner.name, b.owner.phone, b.category))
                .map((b) => (
                  <BusinessCard
                    key={b.id}
                    business={b}
                    busy={busyId === b.id}
                    onDecide={(decision, reason) => decide(b.id, decision, reason)}
                  />
                ))}
            </div>
          )}

          {isUserView && users && users.length > 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/60">
              {users
                .filter((u) => matches(u.name, u.phone, u.email, ...u.businesses.map((b) => b.name)))
                .map((u) => (
                  <UserRow key={u.id} user={u} kind={view as 'CUSTOMERS' | 'OWNERS'} />
                ))}
            </div>
          )}

          {view === 'BOOKINGS' && bookings && bookings.length > 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/60">
              {bookings
                .filter((b) => matches(b.business.name, b.customer.name, b.service.name, b.status))
                .map((b) => (
                  <div key={b.id} className="flex items-start justify-between gap-3 border-b border-slate-700 px-4 py-3 text-sm last:border-0">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-100">
                        {b.customer.name} → {b.business.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {b.service.name} ·{' '}
                        {new Date(b.slotStart).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <p className="text-slate-300">{b.status.replace('_', ' ')}</p>
                      {b.payment && (
                        <p className="text-slate-500">
                          ₹{b.payment.amount} · {b.payment.status.toLowerCase()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {list && list.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-700 py-8 text-center text-sm text-slate-500">
              Nothing here yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
