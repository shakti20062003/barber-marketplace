'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth-client';
import { formatHhmm, formatTime } from '@/lib/image';
import SlotPicker from '@/components/SlotPicker';
import type { BusinessDetail } from '@/lib/types';

const LATE_GRACE_MINUTES = 10;

export default function BookPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [serviceId, setServiceId] = useState(searchParams.get('serviceId') ?? '');
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

  const service = business?.services.find((s) => s.id === serviceId);
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

      <div className="mt-5">
        <SlotPicker
          businessId={id}
          serviceId={serviceId}
          workingHours={business?.workingHours}
          selected={selectedSlot}
          onSelect={setSelectedSlot}
        />
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
