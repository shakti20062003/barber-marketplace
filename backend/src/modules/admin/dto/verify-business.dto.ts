import { z } from 'zod';

export const verifyBusinessSchema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED']),
  reason: z.string().max(500).optional(),
});
export type VerifyBusinessDto = z.infer<typeof verifyBusinessSchema>;

export const createCitySchema = z.object({
  name: z.string().min(1).max(100),
  state: z.string().max(100).optional(),
  country: z.string().default('India'),
});
export type CreateCityDto = z.infer<typeof createCitySchema>;

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().optional(),
});
export type CreateCategoryDto = z.infer<typeof createCategorySchema>;
