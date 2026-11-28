'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { clearSession, getToken, getStoredUser } from '@/lib/auth-client';
import type { Achievement, CurrentUser } from '@/lib/types';
import AvatarPicker from '@/components/AvatarPicker';
import CallButton from '@/components/CallButton';
import BookingAlerts from '@/components/BookingAlerts';
import AccountLinks from '@/components/AccountLinks';
import { cacheKey, useCachedState } from '@/lib/clientCache';
import { formatTime } from '@/lib/image';

interface OwnerBusiness {
  id: string;
  name: string;
  verificationStatus: string;
}

interface City {
  id: string;
  name: string;
}

interface DashboardBooking {
  id: string;
  slotStart: string;
  slotEnd: string;
  status: string;
  service: { name: string };
  customer: { name: string };
  staff: { name: string } | null;
  addOns: { id: string; service: { name: string } }[];
  lateNoShowCandidate: boolean;
  isNew: boolean;
}

interface UpcomingBooking {
  id: string;
  slotStart: string;
  slotEnd: string;
  status: string;
  isNew: boolean;
  service: { name: string };
  customer: { name: string };
  staff: { name: string } | null;
}

interface Dashboard {
  todaysBookings: DashboardBooking[];
  upcomingBookings: UpcomingBooking[];
  cancellationsToday: number;
  revenueToday: number;
  achievements: Achievement[];
}

function Achievements({ list }: { list: Achievement[] }) {
  const earned = list.filter((a) => a.earned);
  const next = list.filter((a) => !a.earned);
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">🏆 Your achievements</h2>
      <p className="text-sm text-muted">
        {earned.length > 0
          ? `You've earned ${earned.length} — customers see these on your salon. Keep it up!`
          : 'Every happy customer and good review brings you closer. Customers see these on your salon.'}
      </p>
      {earned.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {earned.map((a) => (
            <div key={a.key} className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-3">
              <p className="text-2xl" aria-hidden>{a.emoji}</p>
              <p className="mt-1 text-sm font-bold text-amber-900">{a.label}</p>
              <p className="text-xs text-amber-800/80">{a.description}</p>
            </div>
          ))}
        </div>
      )}
      {next.length > 0 && (
        <div className="mt-3 space-y-2">
          {next.map((a) => (
            <div key={a.key} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">
                  <span aria-hidden className="opacity-50">{a.emoji}</span> {a.label}
                </span>
                <span className="text-xs text-muted">
                  {a.progress.current}/{a.progress.target}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${Math.round((a.progress.current / a.progress.target) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">{a.description}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const STATUS_PILL: Record<string, string> = {
  CONFIRMED: 'bg-accent-tint text-accent',
  IN_PROGRESS: 'bg-violet-50 text-violet-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-neutral-100 text-muted',
  NO_SHOW: 'bg-red-50 text-red-700',
  PENDING: 'bg-amber-50 text-amber-700',
};

function BookingRow({ booking, onChange }: { booking: DashboardBooking; onChange: () => void }) {
  const [code, setCode] = useState('');
  const [completing, setCompleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(path: string, body: object = {}, method = 'POST') {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/bookings/${booking.id}/${path}`, { method, token, body: JSON.stringify(body) });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  const active = booking.status === 'CONFIRMED' || booking.status === 'IN_PROGRESS';

  return (
    <div className="p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">
            {booking.isNew && (
              <span className="mr-1.5 rounded bg-brand px-1.5 py-0.5 align-middle text-[10px] font-bold text-brand-foreground">NEW</span>
            )}
            {formatTime(booking.slotStart)} – {formatTime(booking.slotEnd)} · {booking.customer.name}
          </p>
          <p className="text-muted">
            {booking.service.name}
            {booking.addOns.length > 0 && <> + {booking.addOns.map((a) => a.service.name).join(', ')}</>}
            {booking.staff && <> · {booking.staff.name}</>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {active && <CallButton bookingId={booking.id} label="Call customer" compact />}
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_PILL[booking.status] ?? 'bg-neutral-100 text-muted'}`}>
            {booking.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {booking.lateNoShowCandidate && (
        <div className="mt-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-800">
          Customer is more than 10 min late — this slot is now open for new bookings. Mark a no-show or cancel if they
          don&apos;t turn up.
        </div>
      )}

      {active && (
        <div className="mt-2 flex flex-wrap gap-2">
          {booking.status === 'CONFIRMED' && !booking.lateNoShowCandidate && (
            <button
              onClick={() => act('start')}
              disabled={busy}
              className="rounded-full bg-accent-tint px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-50"
            >
              Customer arrived
            </button>
          )}
          {!completing && (
            <button
              onClick={() => setCompleting(true)}
              className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground"
            >
              Complete
            </button>
          )}
          {booking.lateNoShowCandidate && (
            <>
              <button
                onClick={() => act('no-show', { reasonCode: 'LATE_OVER_10_MIN' }, 'PATCH')}
                disabled={busy}
                className="rounded-full border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50"
              >
                Mark no-show
              </button>
              <button
                onClick={() => act('cancel', { reason: 'Customer did not arrive within 10 minutes' })}
                disabled={busy}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                Cancel booking
              </button>
            </>
          )}
        </div>
      )}

      {completing && active && (
        <div className="mt-2 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="Customer's 6-digit code"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 font-mono tracking-widest"
          />
          <button
            onClick={() => act('complete', { otp: code })}
            disabled={busy || code.length !== 6}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground disabled:opacity-50"
          >
            Done
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
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
  const [user, setUser] = useCachedState<CurrentUser | null>(cacheKey('owner:user'), null);
  // Cached across tab switches so returning here doesn't flash "Loading…".
  const [businesses, setBusinesses] = useCachedState<OwnerBusiness[] | null>(cacheKey('owner:businesses'), null);
  const [dashboard, setDashboard] = useCachedState<Dashboard | null>(cacheKey('owner:dashboard'), null);
  const [cities, setCities] = useState<City[]>([]);
  const [form, setForm] = useState({ name: '', category: 'Unisex', cityId: '', lat: '19.076', lng: '72.8777' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [avatarUrl, setAvatarUrl] = useCachedState<string | null>(cacheKey('owner:avatar'), null);

  useEffect(() => {
    const stored = getStoredUser<CurrentUser>();
    const token = getToken();
    if (!token || stored?.role !== 'OWNER') {
      router.push('/login');
      return;
    }
    setUser(stored);
    apiFetch<OwnerBusiness[]>('/owner/businesses', { token }).then(setBusinesses).catch(() => setBusinesses([]));
    apiFetch<City[]>('/cities').then(setCities).catch(() => setCities([]));
    apiFetch<{ avatarUrl: string | null }>('/users/me', { token })
      .then((me) => setAvatarUrl(me.avatarUrl))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadDashboard() {
    const token = getToken();
    if (!token || !businesses?.[0]) return;
    apiFetch<Dashboard>(`/owner/businesses/${businesses[0].id}/dashboard`, { token })
      .then(setDashboard)
      .catch(() => setDashboard(null));
  }

  useEffect(() => {
    loadDashboard();
    // Refresh every minute so the "10 min late" state appears on its own.
    const t = setInterval(loadDashboard, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <div className="mx-auto w-full max-w-md px-4 py-8">
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
          <button
            type="button"
            onClick={() =>
              navigator.geolocation?.getCurrentPosition(
                (pos) =>
                  setForm((f) => ({ ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) })),
                () => setError('Could not get your location — you can set it later under Manage → Location.'),
                { enableHighAccuracy: true, timeout: 15000 },
              )
            }
            className="w-full rounded-xl bg-accent-tint py-2.5 text-sm font-semibold text-accent"
          >
            📍 Use my current location (stand inside the salon)
          </button>
          <p className="text-xs text-muted">
            Location: {form.lat}, {form.lng} — you can fine-tune it later under Manage → Location.
          </p>
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
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between text-sm text-muted">
        <div className="flex items-center gap-3">
          <AvatarPicker name={user.name} avatarUrl={avatarUrl} onChange={setAvatarUrl} size={48} />
          <span>
            Signed in as <span className="font-medium text-foreground">{user.name}</span>
          </span>
        </div>
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
        Manage photos, services, staff &amp; location →
      </Link>
      <Link
        href="/owner/bookings"
        className="mt-2 block rounded-xl border border-border px-4 py-3 text-center text-sm font-semibold hover:bg-brand-tint"
      >
        View booking history →
      </Link>

      <BookingAlerts />
      <AccountLinks />

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
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
          <BookingRow key={b.id} booking={b} onChange={loadDashboard} />
        ))}
        {(!dashboard || dashboard.todaysBookings.length === 0) && (
          <p className="p-3 text-sm text-muted">No bookings today yet.</p>
        )}
      </div>

      <h2 className="mt-6 mb-2 text-lg font-semibold">Upcoming (next 7 days)</h2>
      <div className="divide-y divide-border rounded-xl border border-border bg-surface">
        {dashboard?.upcomingBookings.map((b) => (
          <div key={b.id} className="flex items-start justify-between gap-2 p-3 text-sm">
            <div className="min-w-0">
              <p className="font-semibold">
                {b.isNew && (
                  <span className="mr-1.5 rounded bg-brand px-1.5 py-0.5 align-middle text-[10px] font-bold text-brand-foreground">NEW</span>
                )}
                {new Date(b.slotStart).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })} ·{' '}
                {formatTime(b.slotStart)}
              </p>
              <p className="truncate text-muted">
                {b.customer.name} · {b.service.name}
                {b.staff && <> · {b.staff.name}</>}
              </p>
            </div>
            <CallButton bookingId={b.id} label="Call customer" compact />
          </div>
        ))}
        {(!dashboard || dashboard.upcomingBookings.length === 0) && (
          <p className="p-3 text-sm text-muted">No upcoming bookings in the next 7 days yet.</p>
        )}
      </div>

      {dashboard?.achievements && <Achievements list={dashboard.achievements} />}
    </div>
  );
}
