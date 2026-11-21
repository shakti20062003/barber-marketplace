'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth-client';
import { formatTime } from '@/lib/image';
import type { BusinessDetail, MyBooking } from '@/lib/types';
import SlotPicker, { type PickedSlot } from '@/components/SlotPicker';

/** Customer moves an upcoming booking to another time (same salon & service). */
export default function RescheduleBooking({
  booking,
  onDone,
  onCancel,
}: {
  booking: MyBooking;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [picked, setPicked] = useState<PickedSlot | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<BusinessDetail>(`/businesses/${booking.business.id}`)
      .then(setBusiness)
      .catch(() => setError('Could not load this salon’s times.'));
  }, [booking.business.id]);

  async function confirm() {
    const token = getToken();
    if (!token || !picked) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/bookings/${booking.id}/reschedule`, {
        method: 'POST',
        token,
        body: JSON.stringify({ slotStart: picked.start, staffId: picked.staffId }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the time');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Change time</p>
        <button onClick={onCancel} className="text-xs text-muted underline">
          Keep current time
        </button>
      </div>
      <p className="mb-3 text-xs text-muted">
        Now: {new Date(booking.slotStart).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} at{' '}
        {formatTime(booking.slotStart)}
      </p>

      {business && (
        <SlotPicker
          businessId={booking.business.id}
          serviceId={booking.service.id}
          workingHours={business.workingHours}
          selected={picked}
          onSelect={setPicked}
          hideStart={booking.slotStart}
        />
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        onClick={confirm}
        disabled={!picked || saving}
        className="mt-4 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
      >
        {saving ? 'Changing…' : picked ? `Move to ${formatTime(picked.start)}` : 'Pick a new time'}
      </button>
    </div>
  );
}
