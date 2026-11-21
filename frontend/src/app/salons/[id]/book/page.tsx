'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth-client';
import { formatHhmm, formatTime, localDateIso } from '@/lib/image';
import type { AvailabilityGridEntry, AvailabilityResponse, BusinessDetail } from '@/lib/types';

const LATE_GRACE_MINUTES = 10;

type Busy = 'easy' | 'filling' | 'full';

/** BookMyShow-style fill level for one start time. */
function busyLevel(slot: AvailabilityGridEntry): Busy {
  if (slot.available === 0) return 'full';
  return slot.available / slot.total <= 0.5 ? 'filling' : 'easy';
}

const SLOT_STYLE: Record<Busy, string> = {
  easy: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  filling: 'border-amber-300 bg-amber-50 text-amber-800',
  full: 'border-neutral-200 bg-neutral-100 text-neutral-400 line-through',
};

const PERIODS = [
  { key: 'morning', label: 'Morning', icon: '🌅', from: 0, to: 12 },
  { key: 'afternoon', label: 'Afternoon', icon: '☀️', from: 12, to: 17 },
  { key: 'evening', label: 'Evening', icon: '🌙', from: 17, to: 24 },
] as const;

function hourInIst(iso: string): number {
  return Number(new Date(iso).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' })) % 24;
}

/** How booked a whole period is, from the share of stylist-slots already taken. */
function periodTrend(slots: AvailabilityGridEntry[]): { level: Busy; label: string } {
  const total = slots.reduce((s, x) => s + x.total, 0);
  const free = slots.reduce((s, x) => s + x.available, 0);
  if (total === 0 || free === 0) return { level: 'full', label: 'Fully booked' };
  const booked = 1 - free / total;
  if (booked >= 0.5) return { level: 'filling', label: 'Filling fast' };
  return { level: 'easy', label: 'Easy to book' };
}

const TREND_DOT: Record<Busy, string> = {
  easy: 'bg-emerald-500',
  filling: 'bg-amber-500',
  full: 'bg-red-500',
};

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export default function BookPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [serviceId, setServiceId] = useState(searchParams.get('serviceId') ?? '');
  const [date, setDate] = useState(localDateIso());
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ staffId: string; start: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'PAY_NOW' | 'PAY_AT_SHOP'>('PAY_AT_SHOP');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ bookingId: string; otp?: string; start: string } | null>(null);

  useEffect(() => {
    apiFetch<BusinessDetail>(`/businesses/${id}`)
      .then((b) => {
        setBusiness(b);
        if (!serviceId && b.services[0]) setServiceId(b.services[0].id);
      })
      .catch(() => setError('Could not load this salon.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!serviceId || !date) return;
    // Clears the stale selection from the previous service/date before the
    // new slot list arrives, so a user can never confirm a mismatched slot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedSlot(null);
    setLoadingSlots(true);
    apiFetch<AvailabilityResponse>(`/businesses/${id}/availability?serviceId=${serviceId}&date=${date}`)
      .then(setAvailability)
      .catch(() => setAvailability(null))
      .finally(() => setLoadingSlots(false));
  }, [id, serviceId, date]);

  const dayChips = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const hours = business?.workingHours?.[DAY_KEYS[d.getDay()]];
      return {
        iso: localDateIso(d),
        top: i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString('en-IN', { weekday: 'short' }),
        bottom: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        closed: !!hours?.closed,
      };
    });
  }, [business]);

  const grouped = useMemo(() => {
    const grid = availability?.grid ?? [];
    return PERIODS.map((p) => {
      const slots = grid.filter((s) => {
        const h = hourInIst(s.start);
        return h >= p.from && h < p.to;
      });
      return { ...p, slots, trend: periodTrend(slots) };
    }).filter((p) => p.slots.length > 0);
  }, [availability]);

  const service = business?.services.find((s) => s.id === serviceId);
  const selectedDayHours = (() => {
    const d = new Date(`${date}T00:00:00`);
    return business?.workingHours?.[DAY_KEYS[d.getDay()]];
  })();

  async function confirmBooking() {
    const token = getToken();
    if (!token) {
      router.push(`/login?next=/salons/${id}/book?serviceId=${serviceId}`);
      return;
    }
    if (!selectedSlot) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<{ booking: { id: string }; otp?: string }>('/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          businessId: id,
          serviceId,
          staffId: selectedSlot.staffId,
          slotStart: selectedSlot.start,
          paymentMethod,
        }),
      });
      setConfirmation({ bookingId: result.booking.id, otp: result.otp, start: selectedSlot.start });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create booking. Try another slot.');
    } finally {
      setLoading(false);
    }
  }

  if (confirmation) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-tint text-2xl">✓</div>
        <h1 className="mt-4 text-xl font-bold">Booking confirmed</h1>
        <p className="mt-1 text-sm text-muted">
          {business?.name} · {service?.name}
        </p>
        <p className="mt-1 font-semibold">
          {new Date(confirmation.start).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}{' '}
          at {formatTime(confirmation.start)}
        </p>

        {confirmation.otp && (
          <div className="mt-4 rounded-xl border border-border bg-surface p-5">
            <p className="text-sm text-muted">Show this code at the salon</p>
            <p className="mt-1 text-3xl font-bold tracking-widest text-brand">{confirmation.otp}</p>
            <p className="mt-1 text-xs text-muted">You can always find it again under My bookings.</p>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
          <p className="font-semibold text-amber-900">⏰ Please reach on time for a hassle-free service</p>
          <p className="mt-1 text-sm text-amber-800">
            Your slot is held for {LATE_GRACE_MINUTES} minutes after the start time. After that the salon may give it to
            another customer.
          </p>
        </div>

        <button
          onClick={() => router.push('/account')}
          className="mt-6 w-full rounded-xl bg-brand py-3 font-semibold text-brand-foreground"
        >
          View my bookings
        </button>
        <button
          onClick={() => router.push('/')}
          className="mt-2 w-full rounded-xl border border-border py-3 font-medium hover:bg-brand-tint"
        >
          Back to home
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 pb-28">
      <h1 className="text-xl font-bold">Book {business?.name ?? '…'}</h1>
      {business && (
        <p className={`mt-0.5 text-sm ${business.openNow ? 'text-emerald-700' : 'text-muted'}`}>
          {business.openNow
            ? `Open now · until ${formatHhmm(business.todayHours!.close)}`
            : business.todayHours
              ? `Closed now · today ${formatHhmm(business.todayHours.open)}–${formatHhmm(business.todayHours.close)}`
              : 'Closed today'}
        </p>
      )}

      <label className="mt-5 block text-sm font-semibold">Service</label>
      <select
        value={serviceId}
        onChange={(e) => setServiceId(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5"
      >
        {business?.services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} — ₹{s.price} ({s.durationMinutes} min)
          </option>
        ))}
      </select>

      <p className="mt-5 text-sm font-semibold">Date</p>
      <div className="-mx-4 mt-1.5 flex gap-2 overflow-x-auto px-4 pb-1">
        {dayChips.map((d) => (
          <button
            key={d.iso}
            onClick={() => setDate(d.iso)}
            className={`flex w-16 shrink-0 flex-col items-center rounded-xl border py-2 text-xs ${
              date === d.iso ? 'border-brand bg-brand text-brand-foreground' : 'border-border bg-surface'
            } ${d.closed && date !== d.iso ? 'opacity-50' : ''}`}
          >
            <span className="font-semibold">{d.top}</span>
            <span>{d.closed ? 'Closed' : d.bottom}</span>
          </button>
        ))}
      </div>
      <input
        type="date"
        value={date}
        min={localDateIso()}
        onChange={(e) => e.target.value && setDate(e.target.value)}
        className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
        aria-label="Pick another date"
      />

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Pick a time</p>
          {selectedDayHours && !selectedDayHours.closed && (
            <p className="text-xs text-muted">
              Open {formatHhmm(selectedDayHours.open)}–{formatHhmm(selectedDayHours.close)}
            </p>
          )}
        </div>

        <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded border border-emerald-300 bg-emerald-50" /> Easy to book
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded border border-amber-300 bg-amber-50" /> Filling fast
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded border border-neutral-200 bg-neutral-100" /> Full
          </span>
        </div>

        {loadingSlots && <p className="text-sm text-muted">Loading slots…</p>}

        {!loadingSlots && availability?.closed && (
          <div className="rounded-xl border border-border bg-surface p-4 text-center text-sm text-muted">
            The salon is closed on this day. Please pick another date.
          </div>
        )}

        {!loadingSlots && availability && !availability.closed && grouped.length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-4 text-center text-sm text-muted">
            No slots left on this day — try another date.
          </div>
        )}

        <div className="space-y-4">
          {grouped.map((period) => (
            <div key={period.key}>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-sm font-medium">
                  {period.icon} {period.label}
                </p>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <span className={`h-2 w-2 rounded-full ${TREND_DOT[period.trend.level]}`} />
                  {period.trend.label}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {period.slots.map((slot) => {
                  const level = busyLevel(slot);
                  const selected = selectedSlot?.start === slot.start;
                  return (
                    <button
                      key={slot.start}
                      disabled={level === 'full'}
                      onClick={() => setSelectedSlot({ staffId: slot.staffIds[0], start: slot.start })}
                      className={`rounded-xl border px-2 py-2.5 text-sm font-medium transition ${
                        selected ? 'border-brand bg-brand text-brand-foreground' : SLOT_STYLE[level]
                      }`}
                    >
                      {formatTime(slot.start)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-1.5 text-sm font-semibold">Payment</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setPaymentMethod('PAY_AT_SHOP')}
            className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${
              paymentMethod === 'PAY_AT_SHOP' ? 'border-brand bg-brand-tint text-brand-dark' : 'border-border bg-surface'
            }`}
          >
            Pay at shop
          </button>
          {/* Online payment isn't live yet (Razorpay order creation is still a
              stub), and a PAY_NOW booking would sit PENDING holding the slot
              forever — so it's disabled until payments are wired up. */}
          <button
            disabled
            className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-medium text-muted opacity-60"
          >
            Pay online <span className="block text-[10px]">Coming soon</span>
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="pb-safe fixed inset-x-0 bottom-16 left-0 right-0 border-t border-border bg-surface/95 p-3 backdrop-blur sm:static sm:mt-6 sm:border-0 sm:bg-transparent sm:p-0">
        <div className="mx-auto max-w-md">
          <button
            onClick={confirmBooking}
            disabled={!selectedSlot || loading}
            className="w-full rounded-xl bg-brand py-3 font-semibold text-brand-foreground disabled:opacity-50"
          >
            {loading
              ? 'Confirming…'
              : selectedSlot
                ? `Confirm ${formatTime(selectedSlot.start)}${service ? ` · ₹${service.price}` : ''}`
                : 'Pick a time'}
          </button>
        </div>
      </div>
    </div>
  );
}
