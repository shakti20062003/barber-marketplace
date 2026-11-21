import type { BookingStatus } from 'database';

/**
 * Shared scheduling rules used by both the availability grid and booking
 * creation, so the two can never disagree about what's bookable.
 *
 * All wall-clock maths here assumes the process runs in the salon's
 * timezone (main.ts defaults TZ to Asia/Kolkata). Working hours like
 * "09:00" are local salon time — on a UTC server they used to be read as
 * 09:00 UTC = 2:30 PM IST, which is the bug this module's callers fix.
 */

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** A CONFIRMED booking that hasn't been started this long after its start time stops blocking the slot. */
export const LATE_GRACE_MINUTES = 10;

/** Slot start times are offered on this grid (independent of service duration). */
export const SLOT_STEP_MINUTES = 15;

export const BLOCKING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'];

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type DayHours = { open: string; close: string; closed?: boolean };

export interface TimeWindow {
  start: Date;
  end: Date;
}

/** Local midnight for a "YYYY-MM-DD" string. */
export function localDayStart(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

/** Local midnight of the day containing `d`. */
export function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * Value to compare against a Postgres `@db.Date` column. Prisma sends Dates
 * as UTC instants and Postgres truncates to the UTC date, so passing local
 * midnight in IST (= 18:30 the previous day UTC) would match the wrong day.
 */
export function dbDateFor(localDay: Date): Date {
  return new Date(Date.UTC(localDay.getFullYear(), localDay.getMonth(), localDay.getDate()));
}

export function atTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const out = new Date(day);
  out.setHours(h, m, 0, 0);
  return out;
}

/** The salon's opening window on a given local day, or null if closed that day. */
export function businessWindowFor(workingHours: unknown, day: Date): TimeWindow | null {
  if (!workingHours || typeof workingHours !== 'object') return null;
  const hours = (workingHours as Record<string, DayHours | undefined>)[DAY_KEYS[day.getDay()]];
  if (!hours || hours.closed) return null;
  const start = atTime(day, hours.open);
  const end = atTime(day, hours.close);
  return end > start ? { start, end } : null;
}

export function isOpenAt(workingHours: unknown, at: Date = new Date()): boolean {
  const window = businessWindowFor(workingHours, startOfLocalDay(at));
  return !!window && at >= window.start && at < window.end;
}

/** Today's hours as "HH:mm" strings, for "Opens at 10:00" style copy. */
export function todaysHours(workingHours: unknown, at: Date = new Date()): { open: string; close: string } | null {
  if (!workingHours || typeof workingHours !== 'object') return null;
  const hours = (workingHours as Record<string, DayHours | undefined>)[DAY_KEYS[at.getDay()]];
  if (!hours || hours.closed) return null;
  return { open: hours.open, close: hours.close };
}

function intersect(a: TimeWindow, b: TimeWindow): TimeWindow | null {
  const start = a.start > b.start ? a.start : b.start;
  const end = a.end < b.end ? a.end : b.end;
  return end > start ? { start, end } : null;
}

/**
 * A staff member's working windows on a day, clipped to the salon's hours.
 * Staff with no weekly availability configured (e.g. added from the owner
 * UI, which doesn't ask for hours) default to the salon's full hours —
 * otherwise they'd silently never have a bookable slot.
 */
export function staffWindowsFor(
  day: Date,
  business: TimeWindow | null,
  weekly: { startTime: string; endTime: string }[],
  override: { startTime: string | null; endTime: string | null; isClosed: boolean } | null,
): TimeWindow[] {
  if (!business) return [];
  if (override?.isClosed) return [];
  const raw =
    override?.startTime && override.endTime
      ? [{ startTime: override.startTime, endTime: override.endTime }]
      : weekly;
  if (raw.length === 0) return [business];
  return raw
    .map((w) => intersect({ start: atTime(day, w.startTime), end: atTime(day, w.endTime) }, business))
    .filter((w): w is TimeWindow => w !== null);
}

/**
 * Whether an existing booking still holds its staff member's time. A
 * CONFIRMED booking whose customer hasn't been checked in (moved to
 * IN_PROGRESS) within LATE_GRACE_MINUTES of the start is treated as a
 * likely no-show: the rest of that time is released for new bookings, and
 * the owner can mark it no-show or cancel it. The status itself is never
 * changed automatically (§4.5: no-shows are owner-recorded only).
 */
export function isBlocking(
  booking: { status: BookingStatus; slotStart: Date },
  now: Date = new Date(),
): boolean {
  if (!BLOCKING_STATUSES.includes(booking.status)) return false;
  if (booking.status === 'CONFIRMED') {
    return now.getTime() <= booking.slotStart.getTime() + LATE_GRACE_MINUTES * 60_000;
  }
  return true;
}

export function isPastGrace(booking: { status: BookingStatus; slotStart: Date }, now: Date = new Date()): boolean {
  return booking.status === 'CONFIRMED' && now.getTime() > booking.slotStart.getTime() + LATE_GRACE_MINUTES * 60_000;
}
