import { z } from 'zod';

export const createServiceSchema = z.object({
  categoryId: z.string().uuid().optional(),
  name: z.string().min(1).max(150),
  price: z.number().positive(),
  durationMinutes: z.number().int().positive().max(600),
  description: z.string().max(1000).optional(),
});
export type CreateServiceDto = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = createServiceSchema.partial().extend({
  active: z.boolean().optional(),
});
export type UpdateServiceDto = z.infer<typeof updateServiceSchema>;
