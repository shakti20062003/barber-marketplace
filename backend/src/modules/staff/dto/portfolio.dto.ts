import { z } from 'zod';
import { imageUrlSchema } from '../../../common/validation/image-url.js';

// pairedMediaId/linkedBookingId stay unused this phase.
export const addPortfolioMediaSchema = z.object({
  url: imageUrlSchema,
  type: z.enum(['PORTFOLIO', 'BEFORE_AFTER']).default('PORTFOLIO'),
});
export type AddPortfolioMediaDto = z.infer<typeof addPortfolioMediaSchema>;
