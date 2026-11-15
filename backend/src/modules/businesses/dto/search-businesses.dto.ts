import { z } from 'zod';

export const searchBusinessesSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().positive().max(100).default(10),
  category: z.string().optional(),
  q: z.string().min(1).max(100).optional(),
  openNow: z.coerce.boolean().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  homeService: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});
export type SearchBusinessesDto = z.infer<typeof searchBusinessesSchema>;
