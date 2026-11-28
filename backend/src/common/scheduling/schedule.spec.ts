import { describe, expect, it } from 'vitest';
import {
  LATE_GRACE_MINUTES,
  REMINDER_1H_LEAD_MS,
  REMINDER_24H_LEAD_MS,
  breaksFor,
  businessWindowFor,
  fitsWindow,
  isBlocking,
  isEngaged,
  isOpenAt,
  isPastGrace,
  localDayStart,
  reminderPresetsFor,
  staffWindowsFor,
} from './schedule.js';

const HOURS = {
  mon: { open: '09:00', close: '19:00', closed: false },
  tue: { open: '09:00', close: '19:00', closed: false },
  wed: { open: '09:00', close: '19:00', closed: false },
  thu: { open: '09:00', close: '19:00', closed: false },
  fri: { open: '09:00', close: '19:00', closed: false },
  sat: { open: '10:00', close: '21:00', closed: false },
  sun: { open: '09:00', close: '19:00', closed: true },
};

// 2026-11-23 is a Monday, 2026-11-22 a Sunday.
const MONDAY = localDayStart('2026-11-23');
const SUNDAY = localDayStart('2026-11-22');

describe('businessWindowFor', () => {
  it('uses local wall-clock opening hours', () => {
    const w = businessWindowFor(HOURS, MONDAY)!;
    expect(w.start.getHours()).toBe(9);
    expect(w.end.getHours()).toBe(19);
  });

  it('returns null on a closed day', () => {
    expect(businessWindowFor(HOURS, SUNDAY)).toBeNull();
  });
});

describe('isOpenAt', () => {
  it('is open inside hours and closed outside', () => {
    expect(isOpenAt(HOURS, new Date(2026, 10, 23, 9, 30))).toBe(true);
    expect(isOpenAt(HOURS, new Date(2026, 10, 23, 8, 59))).toBe(false);
    expect(isOpenAt(HOURS, new Date(2026, 10, 23, 19, 0))).toBe(false);
    expect(isOpenAt(HOURS, new Date(2026, 10, 22, 12, 0))).toBe(false); // Sunday
  });
});

describe('staffWindowsFor', () => {
  const business = businessWindowFor(HOURS, MONDAY);

  it('defaults staff with no configured hours to the salon hours', () => {
    expect(staffWindowsFor(MONDAY, business, [], null)).toEqual([business]);
  });

  it('clips staff hours to the salon hours', () => {
    const [w] = staffWindowsFor(MONDAY, business, [{ startTime: '08:00', endTime: '20:00' }], null);
    expect(w.start.getHours()).toBe(9);
    expect(w.end.getHours()).toBe(19);
  });

  it('gives no windows when the salon is closed, even if staff are "available"', () => {
    expect(staffWindowsFor(SUNDAY, null, [{ startTime: '09:00', endTime: '20:00' }], null)).toEqual([]);
  });

  it('respects a day-off override', () => {
    expect(staffWindowsFor(MONDAY, business, [], { startTime: null, endTime: null, isClosed: true })).toEqual([]);
  });
});

describe('late grace period', () => {
  const slotStart = new Date(2026, 10, 23, 11, 0);
  const at = (mins: number) => new Date(slotStart.getTime() + mins * 60_000);

  it('a confirmed booking blocks until the grace period ends', () => {
    const b = { status: 'CONFIRMED' as const, slotStart };
    expect(isBlocking(b, at(-30))).toBe(true);
    expect(isBlocking(b, at(LATE_GRACE_MINUTES))).toBe(true);
    expect(isBlocking(b, at(LATE_GRACE_MINUTES + 1))).toBe(false);
    expect(isPastGrace(b, at(LATE_GRACE_MINUTES + 1))).toBe(true);
  });

  it('a checked-in (in progress) booking keeps blocking', () => {
    expect(isBlocking({ status: 'IN_PROGRESS', slotStart }, at(45))).toBe(true);
  });

  it('cancelled / completed bookings never block', () => {
    expect(isBlocking({ status: 'CANCELLED', slotStart }, at(0))).toBe(false);
    expect(isBlocking({ status: 'COMPLETED', slotStart }, at(0))).toBe(false);
  });
});

describe('fitsWindow (last booking before closing)', () => {
  const w = businessWindowFor(HOURS, MONDAY)!; // 09:00–19:00
  const slot = (h: number, m: number, mins: number) => {
    const start = new Date(2026, 10, 23, h, m);
    return [start, new Date(start.getTime() + mins * 60_000)] as const;
  };

  it('default: a 60-min service must finish by 7 PM, so 6 PM is the last start', () => {
    expect(fitsWindow(...slot(18, 0, 60), w, null)).toBe(true);
    expect(fitsWindow(...slot(18, 15, 60), w, null)).toBe(false);
  });

  it('owner cutoff of 30 min: bookings may start until 6:30 PM, even if they run past closing', () => {
    expect(fitsWindow(...slot(18, 30, 60), w, 30)).toBe(true);
    expect(fitsWindow(...slot(18, 45, 60), w, 30)).toBe(false);
  });

  it('cutoff of 0 allows starting right up to closing time', () => {
    expect(fitsWindow(...slot(18, 45, 60), w, 0)).toBe(true);
    expect(fitsWindow(...slot(19, 0, 60), w, 0)).toBe(true);
  });

  it('never before opening', () => {
    expect(fitsWindow(...slot(8, 45, 30), w, 30)).toBe(false);
  });
});

describe('breaks (e.g. lunch) and late closing', () => {
  const LATE = {
    ...HOURS,
    mon: { open: '10:00', close: '23:00', closed: false, breaks: [{ start: '13:00', end: '14:00' }] },
  };
  const business = businessWindowFor(LATE, MONDAY)!;
  const windows = staffWindowsFor(MONDAY, business, [], null, breaksFor(LATE, MONDAY));
  const slot = (h: number, m: number, mins: number) => {
    const start = new Date(2026, 10, 23, h, m);
    return [start, new Date(start.getTime() + mins * 60_000)] as const;
  };
  const bookable = (h: number, m: number, mins: number, cutoff: number | null = null) =>
    windows.some((w) => fitsWindow(...slot(h, m, mins), w, cutoff));

  it('splits the day around lunch', () => {
    expect(windows).toHaveLength(2);
    expect(windows[0].end.getHours()).toBe(13);
    expect(windows[1].start.getHours()).toBe(14);
  });

  it('nothing can be booked into lunch', () => {
    expect(bookable(12, 0, 60)).toBe(true); // 12:00–13:00 ok
    expect(bookable(12, 30, 60)).toBe(false); // runs into lunch
    expect(bookable(13, 15, 30)).toBe(false); // during lunch
    expect(bookable(14, 0, 30)).toBe(true);
  });

  it('even with a closing cut-off, services must finish before lunch', () => {
    expect(bookable(12, 45, 60, 30)).toBe(false);
  });

  it('supports late closing (11 PM)', () => {
    expect(bookable(22, 0, 60)).toBe(true);
    expect(bookable(22, 15, 60)).toBe(false);
    expect(isOpenAt(LATE, new Date(2026, 10, 23, 22, 30))).toBe(true);
  });

  it('is not "open now" during lunch', () => {
    expect(isOpenAt(LATE, new Date(2026, 10, 23, 13, 30))).toBe(false);
  });
});

describe('reminderPresetsFor', () => {
  const now = new Date(2026, 10, 22, 12, 0); // Sun 22 Nov, 12:00

  it('leaves both reminders unset for a booking well over 24h out', () => {
    const slotStart = new Date(now.getTime() + REMINDER_24H_LEAD_MS + 60_000);
    expect(reminderPresetsFor(slotStart, now)).toEqual({ reminder24hSentAt: null, reminder1hSentAt: null });
  });

  it('pre-marks only the 24h reminder once inside that window but outside the 1h one', () => {
    const slotStart = new Date(now.getTime() + 2 * REMINDER_1H_LEAD_MS); // 2h out
    const presets = reminderPresetsFor(slotStart, now);
    expect(presets.reminder24hSentAt).toBe(now);
    expect(presets.reminder1hSentAt).toBeNull();
  });

  it('pre-marks both reminders for a same-day booking made less than 1h out', () => {
    const slotStart = new Date(now.getTime() + 30 * 60_000); // 30 min out
    const presets = reminderPresetsFor(slotStart, now);
    expect(presets.reminder24hSentAt).toBe(now);
    expect(presets.reminder1hSentAt).toBe(now);
  });
});

describe('isEngaged', () => {
  const now = new Date(2026, 10, 28, 12, 0); // Sat 28 Nov, 12:00

  it('is false when the barber never set an engaged-until time', () => {
    expect(isEngaged({ engagedUntil: null }, new Date(2026, 10, 28, 12, 30), now)).toBe(false);
  });

  it('is false once the engaged window has already elapsed', () => {
    const engagedUntil = new Date(2026, 10, 28, 11, 0); // in the past relative to `now`
    expect(isEngaged({ engagedUntil }, new Date(2026, 10, 28, 12, 30), now)).toBe(false);
  });

  it('blocks a slot that starts before the barber becomes free again', () => {
    const engagedUntil = new Date(2026, 10, 28, 13, 0);
    expect(isEngaged({ engagedUntil }, new Date(2026, 10, 28, 12, 30), now)).toBe(true);
  });

  it('allows a slot that starts at or after the engaged-until time', () => {
    const engagedUntil = new Date(2026, 10, 28, 13, 0);
    expect(isEngaged({ engagedUntil }, new Date(2026, 10, 28, 13, 0), now)).toBe(false);
  });
});
