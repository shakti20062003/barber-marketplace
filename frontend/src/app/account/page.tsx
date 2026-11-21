'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { clearSession, getStoredUser, getToken, saveSession } from '@/lib/auth-client';
import type { BusinessDetail, CurrentUser, MyBooking, Service } from '@/lib/types';
import AvatarPicker from '@/components/AvatarPicker';
import RescheduleBooking from '@/components/RescheduleBooking';
import CallButton from '@/components/CallButton';
import { directionsUrl, formatTime } from '@/lib/image';

interface Profile {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  customerProfile: { reliabilityScore: string; requiresPrepayment: boolean } | null;
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  CONFIRMED: 'bg-accent-tint text-accent',
  RESCHEDULED: 'bg-accent-tint text-accent',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  REVIEWED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-neutral-100 text-muted',
  NO_SHOW: 'bg-red-50 text-red-700',
};

const UPCOMING_STATUSES = new Set(['PENDING', 'CONFIRMED', 'RESCHEDULED', 'IN_PROGRESS']);

function formatSlot(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function ReviewForm({ booking, onSubmitted }: { booking: MyBooking; onSubmitted: () => void }) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const token = getToken();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/reviews', {
        method: 'POST',
        token,
        body: JSON.stringify({ bookingId: booking.id, rating, text: text || undefined }),
      });
      onSubmitted();
    } catch (err) {
      if (err instanceof ApiError && /already been reviewed/i.test(err.message)) {
        onSubmitted(); // it was saved earlier — just close the form and refresh
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Could not submit review');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-brand-tint/40 p-3">
      <p className="text-sm font-medium">Rate your visit</p>
      <div className="mt-1.5 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setRating(n)}
            aria-label={`${n} stars`}
            className={`text-2xl leading-none ${n <= rating ? 'text-amber-500' : 'text-neutral-300'}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="How was it? (optional)"
        rows={2}
        className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={submitting}
        className="mt-2 rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-brand-foreground disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit review'}
      </button>
    </div>
  );
}

function AddServices({ booking, onAdded }: { booking: MyBooking; onAdded: () => void }) {
  const [services, setServices] = useState<Service[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<BusinessDetail>(`/businesses/${booking.business.id}`)
      .then((b) => {
        const already = new Set([booking.service.name, ...booking.addOns.map((a) => a.name)]);
        setServices(b.services.filter((s) => !already.has(s.name)));
      })
      .catch(() => setServices([]));
  }, [booking]);

  const chosen = services?.filter((s) => picked.has(s.id)) ?? [];
  const extraPrice = chosen.reduce((sum, s) => sum + Number(s.price), 0);
  const extraMins = chosen.reduce((sum, s) => sum + s.durationMinutes, 0);

  async function submit() {
    const token = getToken();
    if (!token || chosen.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/bookings/${booking.id}/add-services`, {
        method: 'POST',
        token,
        body: JSON.stringify({ serviceIds: chosen.map((s) => s.id) }),
      });
      setPicked(new Set());
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add services');
    } finally {
      setSaving(false);
    }
  }

  if (services === null) return <p className="text-sm text-muted">Loading services…</p>;
  if (services.length === 0) return <p className="text-sm text-muted">No other services to add.</p>;

  return (
    <div>
      <div className="divide-y divide-border rounded-lg border border-border">
        {services.map((s) => (
          <label key={s.id} className="flex cursor-pointer items-center gap-3 p-2.5 text-sm">
            <input
              type="checkbox"
              checked={picked.has(s.id)}
              onChange={(e) => {
                const next = new Set(picked);
                if (e.target.checked) next.add(s.id);
                else next.delete(s.id);
                setPicked(next);
              }}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            <span className="flex-1">
              {s.name} <span className="text-muted">· {s.durationMinutes} min</span>
            </span>
            <span className="font-medium">₹{s.price}</span>
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={saving || chosen.length === 0}
        className="mt-2 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
      >
        {saving
          ? 'Adding…'
          : chosen.length === 0
            ? 'Select services to add'
            : `Add ${chosen.length} service${chosen.length > 1 ? 's' : ''} · +₹${extraPrice} · +${extraMins} min`}
      </button>
    </div>
  );
}

function BookingCard({ booking, onChange }: { booking: MyBooking; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [justReviewed, setJustReviewed] = useState(false);
  const [addingServices, setAddingServices] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduled, setRescheduled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isUpcoming = UPCOMING_STATUSES.has(booking.status);
  const canCancel = booking.status === 'PENDING' || booking.status === 'CONFIRMED';
  const canReview = booking.status === 'COMPLETED' && !booking.hasReview;
  const canAddServices = isUpcoming && new Date(booking.slotStart) > new Date();

  async function cancelBooking() {
    const token = getToken();
    if (!token) return;
    if (!confirm(`Cancel your booking at ${booking.business.name}?`)) return;
    setCancelling(true);
    setError(null);
    try {
      await apiFetch(`/bookings/${booking.id}/cancel`, { method: 'POST', token, body: JSON.stringify({}) });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel booking');
      setCancelling(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {isUpcoming && booking.confirmationCode && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between bg-brand-tint px-3 py-2 text-left"
        >
          <span className="text-xs font-medium text-brand-dark">Confirmation code · show at the salon</span>
          <span className="font-mono text-lg font-bold tracking-widest text-brand">{booking.confirmationCode}</span>
        </button>
      )}

      <button onClick={() => setOpen((o) => !o)} className="flex w-full gap-3 p-3 text-left">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
          {booking.business.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={booking.business.image} alt={booking.business.name} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">{booking.business.name}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[booking.status] ?? 'bg-neutral-100 text-muted'}`}>
              {booking.status.replace('_', ' ')}
            </span>
          </div>
          <p className="truncate text-sm text-muted">
            {booking.service.name}
            {booking.addOns.length > 0 && <> +{booking.addOns.length} more</>}
            {booking.staff && <> · {booking.staff.name}</>}
          </p>
          <p className="text-sm">{formatSlot(booking.slotStart)}</p>
        </div>
        <span className={`self-center text-muted transition ${open ? 'rotate-180' : ''}`} aria-hidden>
          ⌄
        </span>
      </button>

      {open && (
        <div className="border-t border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Booking details</p>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>{booking.service.name}</span>
              <span>₹{booking.service.price}</span>
            </div>
            {booking.addOns.map((a) => (
              <div key={a.id} className="flex justify-between">
                <span>
                  {a.name} <span className="text-xs text-muted">(added)</span>
                </span>
                <span>₹{a.price}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <span>Total</span>
              <span>₹{booking.totalAmount}</span>
            </div>
            <p className="text-muted">
              {formatTime(booking.slotStart)} – {formatTime(booking.slotEnd)}
            </p>
          </div>

          {isUpcoming && (
            <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
              ⏰ Please reach on time. Your slot is held for 10 minutes after the start time.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {isUpcoming && <CallButton bookingId={booking.id} label="Call salon" />}
            <a
              href={directionsUrl(booking.business.lat, booking.business.lng)}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-border px-3.5 py-1.5 text-sm font-medium hover:bg-accent-tint"
            >
              📍 Directions
            </a>
            <Link
              href={`/salons/${booking.business.id}`}
              className="rounded-full border border-border px-3.5 py-1.5 text-sm font-medium hover:bg-accent-tint"
            >
              View salon
            </Link>
          </div>

          {rescheduled && (
            <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              ✓ Time changed. The salon will see your new time.
            </p>
          )}

          {canAddServices && (
            <div className="mt-3">
              {rescheduling ? (
                <RescheduleBooking
                  booking={booking}
                  onCancel={() => setRescheduling(false)}
                  onDone={() => {
                    setRescheduling(false);
                    setRescheduled(true);
                    onChange();
                  }}
                />
              ) : (
                <button
                  onClick={() => {
                    setRescheduling(true);
                    setAddingServices(false);
                    setRescheduled(false);
                  }}
                  className="w-full rounded-xl border border-border py-2.5 text-sm font-semibold"
                >
                  🕐 Change time
                </button>
              )}
            </div>
          )}

          {canAddServices && !rescheduling && (
            <div className="mt-3">
              {addingServices ? (
                <>
                  <p className="mb-2 text-sm font-semibold">Add more services</p>
                  <AddServices
                    booking={booking}
                    onAdded={() => {
                      setAddingServices(false);
                      onChange();
                    }}
                  />
                </>
              ) : (
                <button
                  onClick={() => setAddingServices(true)}
                  className="w-full rounded-xl bg-brand-tint py-2.5 text-sm font-semibold text-brand-dark"
                >
                  + Add more services
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="px-3 pb-2 text-sm text-red-600">{error}</p>}

      {(canCancel || canReview) && (
        <div className="flex gap-2 px-3 pb-3">
          {canCancel && (
            <button
              onClick={cancelBooking}
              disabled={cancelling}
              className="rounded-full border border-border px-3.5 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
            >
              {cancelling ? 'Cancelling…' : 'Cancel booking'}
            </button>
          )}
          {canReview && !reviewing && (
            <button
              onClick={() => setReviewing(true)}
              className="rounded-full bg-brand-tint px-3.5 py-1.5 text-sm font-medium text-brand-dark"
            >
              Leave a review
            </button>
          )}
        </div>
      )}

      {reviewing && !booking.hasReview && (
        <div className="px-3 pb-3">
          <ReviewForm
            booking={booking}
            onSubmitted={() => {
              setReviewing(false);
              setJustReviewed(true);
              onChange();
            }}
          />
        </div>
      )}

      {justReviewed && (
        <p role="status" className="mx-3 mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          ✓ Thanks! Your review has been posted.
        </p>
      )}

      {booking.review && (
        <div className="mx-3 mb-3 rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm">
          <p className="flex items-center gap-2">
            <span className="font-medium">Your review</span>
            <span className="text-amber-500" aria-label={`${booking.review.rating} out of 5 stars`}>
              {'★'.repeat(booking.review.rating)}
              <span className="text-neutral-300">{'★'.repeat(5 - booking.review.rating)}</span>
            </span>
          </p>
          {booking.review.text && <p className="mt-0.5 text-muted">“{booking.review.text}”</p>}
        </div>
      )}
    </div>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  function reload() {
    const token = getToken();
    if (!token) return;
    apiFetch<Profile>('/users/me', { token }).then(setProfile).catch(() => {});
    apiFetch<MyBooking[]>('/bookings/me', { token }).then(setBookings).catch(() => setBookings([]));
  }

  useEffect(() => {
    const stored = getStoredUser<CurrentUser>();
    const token = getToken();
    if (!token || !stored) {
      router.push('/login?next=/account');
      return;
    }
    if (stored.role === 'OWNER') {
      router.push('/owner');
      return;
    }
    if (stored.role === 'ADMIN') {
      router.push('/admin');
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage read, unavailable during SSR
    setUser(stored);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveName() {
    const token = getToken();
    if (!token || !nameInput.trim()) return;
    setSavingName(true);
    try {
      const updated = await apiFetch<Profile>('/users/me', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ name: nameInput.trim() }),
      });
      setProfile(updated);
      if (user) saveSession(token, { ...user, name: updated.name });
      setUser((u) => (u ? { ...u, name: updated.name } : u));
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  }

  function signOut() {
    clearSession();
    router.push('/');
  }

  if (!user || bookings === null) return <div className="p-6 text-sm text-muted">Loading…</div>;

  const upcoming = bookings
    .filter((b) => UPCOMING_STATUSES.has(b.status))
    .sort((a, b) => new Date(a.slotStart).getTime() - new Date(b.slotStart).getTime());
  const past = bookings.filter((b) => !UPCOMING_STATUSES.has(b.status));
  const visible = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-foreground px-4 pb-10 pt-6 text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          <AvatarPicker
            name={profile?.name ?? user.name}
            avatarUrl={profile?.avatarUrl}
            onChange={(url) => setProfile((p) => (p ? { ...p, avatarUrl: url } : p))}
          />
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex gap-2">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  autoFocus
                  className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-sm text-white placeholder:text-white/50"
                />
                <button onClick={saveName} disabled={savingName} className="text-sm font-semibold text-brand">
                  Save
                </button>
                <button onClick={() => setEditingName(false)} className="text-sm text-white/60">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-bold">{profile?.name ?? user.name}</h1>
                <button
                  onClick={() => {
                    setNameInput(profile?.name ?? user.name);
                    setEditingName(true);
                  }}
                  className="text-xs font-medium text-white/60 underline underline-offset-2"
                >
                  Edit
                </button>
              </div>
            )}
            <p className="text-sm text-white/60">{profile?.phone ?? user.phone}</p>
            {profile?.customerProfile && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white/80">
                ⭐ Reliability {profile.customerProfile.reliabilityScore}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-5 w-full max-w-2xl flex-1 px-4">
        <div className="flex gap-1 rounded-full border border-border bg-surface p-1 shadow-sm">
          <button
            onClick={() => setTab('upcoming')}
            className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
              tab === 'upcoming' ? 'bg-brand text-brand-foreground' : 'text-muted'
            }`}
          >
            Upcoming ({upcoming.length})
          </button>
          <button
            onClick={() => setTab('past')}
            className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
              tab === 'past' ? 'bg-brand text-brand-foreground' : 'text-muted'
            }`}
          >
            Past ({past.length})
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {visible.map((b) => (
            <BookingCard key={b.id} booking={b} onChange={reload} />
          ))}
          {visible.length === 0 && (
            <div className="flex flex-col items-center rounded-2xl border border-border bg-surface py-10 text-center">
              <span className="text-3xl">{tab === 'upcoming' ? '📅' : '🕘'}</span>
              <p className="mt-2 text-sm font-medium text-foreground">
                {tab === 'upcoming' ? 'No upcoming bookings' : 'No past bookings yet'}
              </p>
              <p className="mt-0.5 text-sm text-muted">
                {tab === 'upcoming' ? "You're all free — go treat yourself." : 'Your visit history will show up here.'}
              </p>
              <Link
                href="/"
                className="mt-4 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-brand-foreground"
              >
                Find a salon
              </Link>
            </div>
          )}
        </div>

        <div className="mt-8 border-t border-border pt-4">
          <button
            onClick={signOut}
            className="w-full rounded-xl py-3 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Sign out
          </button>
          <p className="mt-3 pb-6 text-center text-xs text-muted">Trimly · booking made simple</p>
        </div>
      </div>
    </div>
  );
}
