import { formatHhmm } from '@/lib/image';
import type { WorkingHours } from '@/lib/types';

// Always Monday → Sunday. Postgres JSONB doesn't keep the key order the
// hours were saved in (it sorts them: fri, mon, sat, sun, thu, tue, wed),
// so iterating Object.entries() showed the days mixed up.
export const DAYS: { key: string; label: string; short: string }[] = [
  { key: 'mon', label: 'Monday', short: 'Mon' },
  { key: 'tue', label: 'Tuesday', short: 'Tue' },
  { key: 'wed', label: 'Wednesday', short: 'Wed' },
  { key: 'thu', label: 'Thursday', short: 'Thu' },
  { key: 'fri', label: 'Friday', short: 'Fri' },
  { key: 'sat', label: 'Saturday', short: 'Sat' },
  { key: 'sun', label: 'Sunday', short: 'Sun' },
];

const JS_DAY_TO_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function todayKeyIst(): string {
  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' }).toLowerCase();
  return JS_DAY_TO_KEY.find((k) => weekday.startsWith(k)) ?? '';
}

/** One row per day — fits a phone screen without overflowing. */
export default function HoursList({ hours }: { hours: WorkingHours }) {
  const today = todayKeyIst();
  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-surface">
      {DAYS.map((d) => {
        const h = hours?.[d.key];
        const isToday = d.key === today;
        return (
          <div key={d.key} className={`flex items-start justify-between gap-3 px-3 py-2 text-sm ${isToday ? 'bg-brand-tint/50' : ''}`}>
            <span className={isToday ? 'font-semibold' : 'text-muted'}>
              {d.label}
              {isToday && <span className="ml-1.5 rounded bg-brand px-1 py-0.5 text-[10px] font-semibold text-brand-foreground">TODAY</span>}
            </span>
            <span className="text-right">
              {!h || h.closed ? (
                <span className="font-medium text-muted">Closed</span>
              ) : (
                <>
                  <span className="whitespace-nowrap font-medium">
                    {formatHhmm(h.open)} – {formatHhmm(h.close)}
                  </span>
                  {h.breaks?.map((b) => (
                    <span key={b.start} className="block whitespace-nowrap text-xs text-muted">
                      Break {formatHhmm(b.start)} – {formatHhmm(b.end)}
                    </span>
                  ))}
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
