'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth-client';
import type { AvailabilityResponse, BusinessDetail } from '@/lib/types';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function BookPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [serviceId, setServiceId] = useState(searchParams.get('serviceId') ?? '');
  const [date, setDate] = useState(todayIso());
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ staffId: string; start: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'PAY_NOW' | 'PAY_AT_SHOP'>('PAY_AT_SHOP');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ bookingId: string; otp?: string } | null>(null);

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
    apiFetch<AvailabilityResponse>(`/businesses/${id}/availability?serviceId=${serviceId}&date=${date}`)
      .then(setAvailability)
      .catch(() => setAvailability(null));
  }, [id, serviceId, date]);

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
      setConfirmation({ bookingId: result.booking.id, otp: result.otp });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create booking. Try another slot.');
    } finally {
      setLoading(false);
    }
  }

  if (confirmation) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-tint text-2xl">
          ✓
        </div>
        <h1 className="mt-4 text-xl font-bold">Booking confirmed</h1>
        <p className="mt-2 text-sm text-muted">Booking ID: {confirmation.bookingId}</p>
        {confirmation.otp && (
          <div className="mt-4 rounded-xl border border-border bg-surface p-5">
            <p className="text-sm text-muted">Show this code at the salon</p>
            <p className="mt-1 text-3xl font-bold tracking-widest text-brand">{confirmation.otp}</p>
          </div>
        )}
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
    <div className="mx-auto max-w-md px-4 py-6 pb-28">
      <h1 className="text-xl font-bold">Book {business?.name ?? '…'}</h1>

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

      <label className="mt-5 block text-sm font-semibold">Date</label>
      <input
        type="date"
        value={date}
        min={todayIso()}
        onChange={(e) => setDate(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5"
      />

      <div className="mt-5">
        <p className="mb-1.5 text-sm font-semibold">Available slots</p>
        <div className="grid grid-cols-3 gap-2">
          {availability?.slots.map((slot) => (
            <button
              key={`${slot.staffId}-${slot.start}`}
              onClick={() => setSelectedSlot(slot)}
              className={`rounded-xl border px-2 py-2.5 text-sm font-medium ${
                selectedSlot?.start === slot.start && selectedSlot.staffId === slot.staffId
                  ? 'border-brand bg-brand text-brand-foreground'
                  : 'border-border bg-surface hover:border-brand/40'
              }`}
            >
              {new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </button>
          ))}
          {availability && availability.slots.length === 0 && (
            <p className="col-span-3 text-sm text-muted">No slots available that day — try another date.</p>
          )}
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
          <button
            onClick={() => setPaymentMethod('PAY_NOW')}
            className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${
              paymentMethod === 'PAY_NOW' ? 'border-brand bg-brand-tint text-brand-dark' : 'border-border bg-surface'
            }`}
          >
            Pay now
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
            {loading ? 'Confirming…' : 'Confirm booking'}
          </button>
        </div>
      </div>
    </div>
  );
}
