import { z } from 'zod';

export const createAddressSchema = z.object({
  label: z.string().trim().min(1).max(60),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  formattedAddress: z.string().trim().min(1).max(500),
});
export type CreateAddressDto = z.infer<typeof createAddressSchema>;
