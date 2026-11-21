'use client';

import { useState } from 'react';
import { DAYS } from '@/components/HoursList';
import type { DayHours, WorkingHours } from '@/lib/types';

const DEFAULT_DAY: DayHours = { open: '09:00', close: '19:00', closed: false, breaks: [] };

function normalise(hours: WorkingHours | undefined): WorkingHours {
  const out: WorkingHours = {};
  for (const d of DAYS) {
    const h = hours?.[d.key];
    out[d.key] = h ? { ...h, breaks: h.breaks ?? [] } : { ...DEFAULT_DAY, closed: d.key === 'sun' };
  }
  return out;
}

/** Problems that would make the API reject the hours, per day (null = fine). */
function dayError(h: DayHours): string | null {
  if (h.closed) return null;
  if (h.close <= h.open) return 'Closing time must be after opening time';
  for (const b of h.breaks ?? []) {
    if (b.end <= b.start) return 'A break must end after it starts';
    if (b.start < h.open || b.end > h.close) return 'Breaks must be within opening hours';
  }
  return null;
}

const inputClass = 'w-full min-w-0 rounded-lg border border-border bg-surface px-2 py-1.5';

/**
 * Owner-editable opening hours: open/close per day (any time, e.g. till
 * 23:00), closed days, and breaks such as lunch that customers can't book.
 */
export default function WorkingHoursEditor({
  initial,
  saving,
  onSave,
}: {
  initial: WorkingHours;
  saving: boolean;
  onSave: (hours: WorkingHours) => Promise<boolean>;
}) {
  const [hours, setHours] = useState<WorkingHours>(() => normalise(initial));
  const [saved, setSaved] = useState(false);

  const errors = Object.fromEntries(DAYS.map((d) => [d.key, dayError(hours[d.key])]));
  const hasErrors = Object.values(errors).some(Boolean);

  function update(day: string, patch: Partial<DayHours>) {
    setSaved(false);
    setHours((h) => ({ ...h, [day]: { ...h[day], ...patch } }));
  }

  function copyToAll(from: string) {
    setSaved(false);
    setHours((h) => {
      const src = h[from];
      const out: WorkingHours = {};
      for (const d of DAYS) {
        out[d.key] = { ...src, breaks: (src.breaks ?? []).map((b) => ({ ...b })), closed: d.key === from ? src.closed : h[d.key].closed };
      }
      return out;
    });
  }

  return (
    <div className="space-y-2">
      {DAYS.map((d) => {
        const h = hours[d.key];
        return (
          <div key={d.key} className={`rounded-xl border p-3 ${errors[d.key] ? 'border-red-300 bg-red-50/40' : 'border-border bg-surface'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{d.label}</span>
              <label className="flex items-center gap-2 text-sm">
                <span className={h.closed ? 'text-muted' : 'font-medium text-emerald-700'}>{h.closed ? 'Closed' : 'Open'}</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={!h.closed}
                  onChange={(e) => update(d.key, { closed: !e.target.checked })}
                  className="h-5 w-5 accent-[var(--brand)]"
                  aria-label={`${d.label} open`}
                />
              </label>
            </div>

            {!h.closed && (
              <>
                <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <input
                    type="time"
                    step={900}
                    value={h.open}
                    onChange={(e) => update(d.key, { open: e.target.value })}
                    className={inputClass}
                    aria-label={`${d.label} opening time`}
                  />
                  <span className="text-xs text-muted">to</span>
                  <input
                    type="time"
                    step={900}
                    value={h.close}
                    onChange={(e) => update(d.key, { close: e.target.value })}
                    className={inputClass}
                    aria-label={`${d.label} closing time`}
                  />
                </div>

                {(h.breaks ?? []).map((b, i) => (
                  <div key={i} className="mt-2 grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2 text-sm">
                    <span className="text-xs text-muted">Break</span>
                    <input
                      type="time"
                      step={900}
                      value={b.start}
                      onChange={(e) =>
                        update(d.key, { breaks: h.breaks!.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })
                      }
                      className={inputClass}
                      aria-label={`${d.label} break ${i + 1} start`}
                    />
                    <span className="text-xs text-muted">–</span>
                    <input
                      type="time"
                      step={900}
                      value={b.end}
                      onChange={(e) =>
                        update(d.key, { breaks: h.breaks!.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })
                      }
                      className={inputClass}
                      aria-label={`${d.label} break ${i + 1} end`}
                    />
                    <button
                      type="button"
                      onClick={() => update(d.key, { breaks: h.breaks!.filter((_, j) => j !== i) })}
                      className="px-1 text-muted"
                      aria-label="Remove break"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {(h.breaks?.length ?? 0) < 3 && (
                    <button
                      type="button"
                      onClick={() => update(d.key, { breaks: [...(h.breaks ?? []), { start: '13:00', end: '14:00' }] })}
                      className="font-semibold text-accent"
                    >
                      + Add break (e.g. lunch)
                    </button>
                  )}
                  <button type="button" onClick={() => copyToAll(d.key)} className="text-muted underline">
                    Copy to all days
                  </button>
                </div>
              </>
            )}
            {errors[d.key] && <p className="mt-1.5 text-xs font-medium text-red-600">{errors[d.key]}</p>}
          </div>
        );
      })}

      <button
        onClick={async () => setSaved(await onSave(hours))}
        disabled={saving || hasErrors}
        className="w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
      >
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save opening hours'}
      </button>
      <p className="text-xs text-muted">
        Customers can only book inside these hours, never during a break. Existing bookings are not changed.
      </p>
    </div>
  );
}
