import { z } from 'zod';

export const createStaffSchema = z.object({
  name: z.string().min(1).max(150),
  experienceYears: z.number().int().min(0).max(70).optional(),
  specializations: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  photoUrl: z.string().url().optional(),
  homeServiceCapable: z.boolean().default(false),
});
export type CreateStaffDto = z.infer<typeof createStaffSchema>;

export const updateStaffSchema = createStaffSchema.partial().extend({
  active: z.boolean().optional(),
});
export type UpdateStaffDto = z.infer<typeof updateStaffSchema>;

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);

export const setStaffAvailabilitySchema = z.object({
  weekly: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: timeSchema,
        endTime: timeSchema,
      }),
    )
    .default([]),
});
export type SetStaffAvailabilityDto = z.infer<typeof setStaffAvailabilitySchema>;
