import { z } from 'zod';

export const createMediaSchema = z.object({
  url: z.string().url(),
  type: z.enum(['IMAGE', 'VIDEO']).default('IMAGE'),
});
export type CreateMediaDto = z.infer<typeof createMediaSchema>;
