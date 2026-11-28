import { z } from 'zod';
import { imageUrlSchema } from '../../../common/validation/image-url.js';

// Deliberately no `name`, `businessId`, or `homeServiceCapable` — those stay
// owner-only, so a barber can't impersonate someone else or move salons.
export const updateStaffSelfSchema = z.object({
  experienceYears: z.number().int().min(0).max(70).optional(),
  specializations: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  photoUrl: imageUrlSchema.optional(),
});
export type UpdateStaffSelfDto = z.infer<typeof updateStaffSelfSchema>;

// 0 clears the engaged status.
export const setEngagedSchema = z.object({
  minutes: z.number().int().min(0).max(240),
});
export type SetEngagedDto = z.infer<typeof setEngagedSchema>;
