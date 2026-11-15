'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { clearSession, getStoredUser, getToken, saveSession } from '@/lib/auth-client';
import type { CurrentUser, MyBooking } from '@/lib/types';

interface Profile {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
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

const UPCOMING_STATUSES = new Set(['PENDING', 'CONFIRMED', 'RESCHEDULED']);

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

function BookingCard({ booking, onChange }: { booking: MyBooking; onChange: () => void }) {
  const [cancelling, setCancelling] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCancel = UPCOMING_STATUSES.has(booking.status);
  const canReview = booking.status === 'COMPLETED' && !booking.hasReview;

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
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
          {booking.business.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={booking.business.image} alt={booking.business.name} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/salons/${booking.business.id}`} className="truncate font-medium hover:underline">
              {booking.business.name}
            </Link>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[booking.status] ?? 'bg-neutral-100 text-muted'}`}>
              {booking.status.replace('_', ' ')}
            </span>
          </div>
          <p className="text-sm text-muted">
            {booking.service.name}
            {booking.staff && <> · {booking.staff.name}</>}
          </p>
          <p className="text-sm">{formatSlot(booking.slotStart)}</p>
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {(canCancel || canReview) && (
        <div className="mt-2 flex gap-2">
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

      {reviewing && <ReviewForm booking={booking} onSubmitted={onChange} />}
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

  const upcoming = bookings.filter((b) => UPCOMING_STATUSES.has(b.status));
  const past = bookings.filter((b) => !UPCOMING_STATUSES.has(b.status));
  const visible = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-foreground px-4 pb-10 pt-6 text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand text-2xl font-bold text-brand-foreground ring-4 ring-white/10">
            {(profile?.name ?? user.name).charAt(0).toUpperCase()}
          </div>
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
