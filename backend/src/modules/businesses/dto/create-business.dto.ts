import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm, e.g. 09:30 or 23:00');

const workingHoursDaySchema = z
  .object({
    open: hhmm,
    close: hhmm,
    closed: z.boolean().default(false),
    // Times inside opening hours when nobody can book (e.g. lunch 13:00–14:00).
    breaks: z
      .array(z.object({ start: hhmm, end: hhmm }).refine((b) => b.end > b.start, 'Break must end after it starts'))
      .max(3)
      .default([]),
  })
  .refine((d) => d.closed || d.close > d.open, { message: 'Closing time must be after opening time', path: ['close'] })
  .refine((d) => d.closed || d.breaks.every((b) => b.start >= d.open && b.end <= d.close), {
    message: 'Breaks must be within opening hours',
    path: ['breaks'],
  });

export const workingHoursSchema = z.object({
  mon: workingHoursDaySchema,
  tue: workingHoursDaySchema,
  wed: workingHoursDaySchema,
  thu: workingHoursDaySchema,
  fri: workingHoursDaySchema,
  sat: workingHoursDaySchema,
  sun: workingHoursDaySchema,
});

export const createBusinessSchema = z.object({
  name: z.string().min(2).max(200),
  category: z.string().min(2).max(100),
  gstNumber: z.string().optional(),
  description: z.string().max(2000).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().max(500).nullable().optional(),
  cityId: z.string().uuid(),
  workingHours: workingHoursSchema,
  // null = service must finish by closing (default rule).
  lastBookingCutoffMinutes: z.number().int().min(0).max(240).nullable().optional(),
});
export type CreateBusinessDto = z.infer<typeof createBusinessSchema>;

export const updateBusinessSchema = createBusinessSchema.partial();
export type UpdateBusinessDto = z.infer<typeof updateBusinessSchema>;
