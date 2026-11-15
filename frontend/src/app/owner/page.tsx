'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { clearSession, getToken, getStoredUser } from '@/lib/auth-client';
import type { CurrentUser } from '@/lib/types';

interface OwnerBusiness {
  id: string;
  name: string;
  verificationStatus: string;
}

interface City {
  id: string;
  name: string;
}

interface Dashboard {
  todaysBookings: { id: string; slotStart: string; status: string; service: { name: string }; customer: { name: string } }[];
  cancellationsToday: number;
  revenueToday: number;
}

const DEFAULT_HOURS = { open: '09:00', close: '19:00', closed: false };
const DEFAULT_WORKING_HOURS = {
  mon: DEFAULT_HOURS,
  tue: DEFAULT_HOURS,
  wed: DEFAULT_HOURS,
  thu: DEFAULT_HOURS,
  fri: DEFAULT_HOURS,
  sat: DEFAULT_HOURS,
  sun: { ...DEFAULT_HOURS, closed: true },
};

export default function OwnerPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [businesses, setBusinesses] = useState<OwnerBusiness[] | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [form, setForm] = useState({ name: '', category: 'Unisex', cityId: '', lat: '19.076', lng: '72.8777' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stored = getStoredUser<CurrentUser>();
    const token = getToken();
    if (!token || stored?.role !== 'OWNER') {
      router.push('/login');
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage read, unavailable during SSR
    setUser(stored);
    apiFetch<OwnerBusiness[]>('/owner/businesses', { token }).then(setBusinesses).catch(() => setBusinesses([]));
    apiFetch<City[]>('/cities').then(setCities).catch(() => setCities([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token || !businesses?.[0]) return;
    apiFetch<Dashboard>(`/owner/businesses/${businesses[0].id}/dashboard`, { token })
      .then(setDashboard)
      .catch(() => setDashboard(null));
  }, [businesses]);

  async function createBusiness() {
    const token = getToken();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await apiFetch<OwnerBusiness>('/owner/businesses', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          cityId: form.cityId,
          lat: Number(form.lat),
          lng: Number(form.lng),
          workingHours: DEFAULT_WORKING_HOURS,
        }),
      });
      setBusinesses([created]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your salon listing');
    } finally {
      setSubmitting(false);
    }
  }

  if (!user || businesses === null) return <div className="p-6 text-sm text-muted">Loading…</div>;

  if (businesses.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <h1 className="text-xl font-bold">Set up your salon</h1>
        <p className="mt-1 text-sm text-muted">
          You&apos;ll appear in search once an admin verifies your listing (§4.4).
        </p>
        <div className="mt-4 space-y-3">
          <input
            placeholder="Salon name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5"
          />
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5"
          >
            <option>Men</option>
            <option>Women</option>
            <option>Unisex</option>
            <option>Spa</option>
          </select>
          <select
            value={form.cityId}
            onChange={(e) => setForm({ ...form, cityId: e.target.value })}
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5"
          >
            <option value="">Select city</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={createBusiness}
            disabled={submitting || !form.name || !form.cityId}
            className="w-full rounded-xl bg-brand py-3 font-semibold text-brand-foreground disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create listing'}
          </button>
        </div>
      </div>
    );
  }

  const business = businesses[0];
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>Signed in as {user.name}</span>
        <button
          onClick={() => {
            clearSession();
            router.push('/');
          }}
          className="font-medium underline hover:text-foreground"
        >
          Sign out
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">{business.name}</h1>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            business.verificationStatus === 'VERIFIED'
              ? 'bg-accent-tint text-accent'
              : 'bg-amber-100 text-amber-700'
          }`}
        >
          {business.verificationStatus}
        </span>
      </div>

      {business.verificationStatus !== 'VERIFIED' && (
        <p className="mt-1 text-sm text-amber-700">
          This salon won&apos;t appear to customers until an admin verifies it.
        </p>
      )}

      <Link
        href="/owner/manage"
        className="mt-3 block rounded-xl bg-brand-tint px-4 py-3 text-center text-sm font-semibold text-brand-dark"
      >
        Manage services, staff &amp; photos →
      </Link>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-muted">Revenue today</p>
          <p className="text-2xl font-bold">₹{dashboard?.revenueToday ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-muted">Bookings today</p>
          <p className="text-2xl font-bold">{dashboard?.todaysBookings.length ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-muted">Cancellations</p>
          <p className="text-2xl font-bold">{dashboard?.cancellationsToday ?? 0}</p>
        </div>
      </div>

      <h2 className="mt-6 mb-2 text-lg font-semibold">Today&apos;s bookings</h2>
      <div className="divide-y divide-border rounded-xl border border-border bg-surface">
        {dashboard?.todaysBookings.map((b) => (
          <div key={b.id} className="flex items-center justify-between p-3 text-sm">
            <span>{new Date(b.slotStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <span>{b.customer.name}</span>
            <span>{b.service.name}</span>
            <span className="text-muted">{b.status}</span>
          </div>
        ))}
        {(!dashboard || dashboard.todaysBookings.length === 0) && (
          <p className="p-3 text-sm text-muted">No bookings today yet.</p>
        )}
      </div>
    </div>
  );
}
