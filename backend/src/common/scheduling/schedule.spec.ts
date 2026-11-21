import { describe, expect, it } from 'vitest';
import {
  LATE_GRACE_MINUTES,
  businessWindowFor,
  fitsWindow,
  isBlocking,
  isOpenAt,
  isPastGrace,
  localDayStart,
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
