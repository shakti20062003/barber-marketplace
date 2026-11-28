'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { formatHhmm, formatTime, localDateIso } from '@/lib/image';
import type { AvailabilityGridEntry, AvailabilityResponse, WorkingHours } from '@/lib/types';

/**
 * Date chips + time slots coloured by how crowded the salon is at that time.
 * Shared by booking (/salons/[id]/book) and rescheduling (My bookings).
 *
 * Crowd level = share of the salon's working stylists already booked at that
 * start time (from the availability grid's available/total):
 *   Free    — nobody booked
 *   Busy    — some booked (< 60%)
 *   Crowded — most booked (≥ 60%) but someone is still free
 *   Full    — no stylist free (not selectable)
 * e.g. 5 stylists: 1–2 booked = Busy, 3–4 = Crowded, 5 = Full.
 * A one-stylist salon goes straight from Free to Full.
 */
export type Crowd = 'free' | 'busy' | 'crowded' | 'full';

export function crowdLevel(slot: Pick<AvailabilityGridEntry, 'available' | 'total'>): Crowd {
  if (slot.available === 0) return 'full';
  const booked = slot.total - slot.available;
  if (booked === 0) return 'free';
  return booked / slot.total >= 0.6 ? 'crowded' : 'busy';
}

export const CROWD: Record<Crowd, { label: string; slot: string; dot: string; swatch: string }> = {
  free: {
    label: 'Free',
    slot: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    dot: 'bg-emerald-500',
    swatch: 'border-emerald-300 bg-emerald-50',
  },
  busy: {
    label: 'Busy',
    slot: 'border-amber-300 bg-amber-50 text-amber-800',
    dot: 'bg-amber-500',
    swatch: 'border-amber-300 bg-amber-50',
  },
  crowded: {
    label: 'Crowded',
    slot: 'border-orange-400 bg-orange-100 text-orange-900',
    dot: 'bg-orange-500',
    swatch: 'border-orange-400 bg-orange-100',
  },
  full: {
    label: 'Full',
    slot: 'border-neutral-200 bg-neutral-100 text-neutral-400 line-through',
    dot: 'bg-neutral-400',
    swatch: 'border-neutral-200 bg-neutral-100',
  },
};

const PERIODS = [
  { key: 'morning', label: 'Morning', icon: '🌅', from: 0, to: 12 },
  { key: 'afternoon', label: 'Afternoon', icon: '☀️', from: 12, to: 17 },
  { key: 'evening', label: 'Evening', icon: '🌙', from: 17, to: 24 },
] as const;

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function hourInIst(iso: string): number {
  return Number(new Date(iso).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' })) % 24;
}

/**
 * Overall crowd for a part of the day, from the share of all stylist-slots
 * booked. More lenient than a single slot: one booking in a mostly empty
 * morning shouldn't make the whole morning read "busy".
 */
function periodCrowd(slots: AvailabilityGridEntry[]): Crowd {
  const total = slots.reduce((s, x) => s + x.total, 0);
  const free = slots.reduce((s, x) => s + x.available, 0);
  if (total === 0 || free === 0) return 'full';
  const booked = 1 - free / total;
  if (booked < 0.2) return 'free';
  return booked < 0.6 ? 'busy' : 'crowded';
}

const PERIOD_LABEL: Record<Crowd, string> = {
  free: 'Mostly free',
  busy: 'Getting busy',
  crowded: 'Mostly crowded',
  full: 'Fully booked',
};

export interface PickedSlot {
  staffId: string;
  start: string;
}

export default function SlotPicker({
  businessId,
  serviceId,
  workingHours,
  selected,
  onSelect,
  hideStart,
  preferredStaffId,
  homeService,
}: {
  businessId: string;
  serviceId: string;
  workingHours: WorkingHours | undefined;
  selected: PickedSlot | null;
  onSelect: (slot: PickedSlot | null) => void;
  /** e.g. the booking being rescheduled — not offered as a "new" time. */
  hideStart?: string;
  /** Pre-filter the grid to one stylist — crowd becomes binary (Free/Full). */
  preferredStaffId?: string;
  /** Only show stylists who offer home visits. */
  homeService?: boolean;
}) {
  const [date, setDate] = useState(localDateIso());
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!serviceId || !date) return;
    // Clear the selection from the previous service/date before new slots
    // arrive, so a stale slot can never be confirmed.
    onSelect(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the fetch below
    setLoading(true);
    const params = new URLSearchParams({ serviceId, date });
    if (preferredStaffId) params.set('staffId', preferredStaffId);
    if (homeService) params.set('homeService', 'true');
    apiFetch<AvailabilityResponse>(`/businesses/${businessId}/availability?${params.toString()}`)
      .then(setAvailability)
      .catch(() => setAvailability(null))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, serviceId, date, preferredStaffId, homeService]);

  const dayChips = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const hours = workingHours?.[DAY_KEYS[d.getDay()]];
        return {
          iso: localDateIso(d),
          top: i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString('en-IN', { weekday: 'short' }),
          bottom: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
          closed: !!hours?.closed,
        };
      }),
    [workingHours],
  );

  const grouped = useMemo(() => {
    const grid = (availability?.grid ?? []).filter((s) => s.start !== hideStart);
    return PERIODS.map((p) => {
      const slots = grid.filter((s) => {
        const h = hourInIst(s.start);
        return h >= p.from && h < p.to;
      });
      return { ...p, slots, crowd: periodCrowd(slots) };
    }).filter((p) => p.slots.length > 0);
  }, [availability, hideStart]);

  const dayHours = workingHours?.[DAY_KEYS[new Date(`${date}T00:00:00`).getDay()]];

  return (
    <div>
      <p className="text-sm font-semibold">Date</p>
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
          {dayHours && !dayHours.closed && (
            <p className="text-xs text-muted">
              Open {formatHhmm(dayHours.open)}–{formatHhmm(dayHours.close)}
            </p>
          )}
        </div>

        <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {(Object.keys(CROWD) as Crowd[]).map((c) => (
            <span key={c} className="flex items-center gap-1">
              <span className={`h-3 w-3 rounded border ${CROWD[c].swatch}`} /> {CROWD[c].label}
            </span>
          ))}
        </div>

        {loading && <p className="text-sm text-muted">Loading slots…</p>}

        {!loading && availability?.closed && (
          <div className="rounded-xl border border-border bg-surface p-4 text-center text-sm text-muted">
            The salon is closed on this day. Please pick another date.
          </div>
        )}
        {!loading && availability && !availability.closed && grouped.length === 0 && (
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
                  <span className={`h-2 w-2 rounded-full ${CROWD[period.crowd].dot}`} />
                  {PERIOD_LABEL[period.crowd]}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {period.slots.map((slot) => {
                  const crowd = crowdLevel(slot);
                  const isSelected = selected?.start === slot.start;
                  return (
                    <button
                      key={slot.start}
                      disabled={crowd === 'full'}
                      onClick={() => onSelect({ staffId: slot.staffIds[0], start: slot.start })}
                      className={`flex flex-col items-center rounded-xl border px-1 py-2 text-sm font-medium transition ${
                        isSelected ? 'border-brand bg-brand text-brand-foreground' : CROWD[crowd].slot
                      }`}
                    >
                      {formatTime(slot.start)}
                      {slot.total > 1 && crowd !== 'full' && (
                        <span className={`text-[10px] font-normal ${isSelected ? 'text-brand-foreground/80' : 'opacity-75'}`}>
                          {slot.available} of {slot.total} free
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
