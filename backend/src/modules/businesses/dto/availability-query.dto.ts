import { z } from 'zod';

export const availabilityQuerySchema = z.object({
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().optional(), // omitted = "any staff" (aggregate capacity)
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // "YYYY-MM-DD"
});
export type AvailabilityQueryDto = z.infer<typeof availabilityQuerySchema>;
