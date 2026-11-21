import { z } from 'zod';
import { imageUrlSchema } from '../../../common/validation/image-url.js';

export const createMediaSchema = z.object({
  url: imageUrlSchema,
  type: z.enum(['IMAGE', 'VIDEO']).default('IMAGE'),
});
export type CreateMediaDto = z.infer<typeof createMediaSchema>;
