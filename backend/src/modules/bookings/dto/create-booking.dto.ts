import { z } from 'zod';

export const createBookingSchema = z.object({
  businessId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().optional(), // omitted = "any staff"
  slotStart: z.string().datetime(),
  paymentMethod: z.enum(['PAY_NOW', 'PAY_AT_SHOP']),
  serviceLocationType: z.enum(['IN_SALON', 'HOME_SERVICE']).default('IN_SALON'),
  addressId: z.string().uuid().optional(), // required when HOME_SERVICE — validated in service
});
export type CreateBookingDto = z.infer<typeof createBookingSchema>;

export const rescheduleBookingSchema = z.object({
  slotStart: z.string().datetime(),
  staffId: z.string().uuid().optional(),
});
export type RescheduleBookingDto = z.infer<typeof rescheduleBookingSchema>;

export const cancelBookingSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});
export type CancelBookingDto = z.infer<typeof cancelBookingSchema>;

export const completeBookingSchema = z.object({
  otp: z.string().length(6),
});
export type CompleteBookingDto = z.infer<typeof completeBookingSchema>;

export const markNoShowSchema = z.object({
  reasonCode: z.string().min(1).max(200), // owner-supplied, never system-automated (§4.5 AC)
});
export type MarkNoShowDto = z.infer<typeof markNoShowSchema>;

export const addServicesSchema = z.object({
  serviceIds: z.array(z.string().uuid()).min(1).max(10),
});
export type AddServicesDto = z.infer<typeof addServicesSchema>;
