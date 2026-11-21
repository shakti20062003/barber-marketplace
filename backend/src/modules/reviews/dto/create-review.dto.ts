import { z } from 'zod';
import { imageUrlSchema } from '../../../common/validation/image-url.js';

export const createReviewSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  staffRating: z.number().int().min(1).max(5).optional(),
  text: z.string().max(2000).optional(),
  mediaUrls: z.array(imageUrlSchema).max(6).default([]),
});
export type CreateReviewDto = z.infer<typeof createReviewSchema>;
