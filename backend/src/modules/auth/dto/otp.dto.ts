import { z } from 'zod';

// E.164-ish phone format, e.g. +919876543210
const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format, e.g. +919876543210');

export const sendOtpSchema = z.object({
  phone: phoneSchema,
});
export type SendOtpDto = z.infer<typeof sendOtpSchema>;

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().length(6),
  // Only used the first time this phone signs up; ignored on subsequent
  // logins so an existing account's role can never be changed this way.
  name: z.string().min(1).max(120).optional(),
  role: z.enum(['CUSTOMER', 'OWNER']).default('CUSTOMER'),
});
export type VerifyOtpDto = z.infer<typeof verifyOtpSchema>;

// Barbers never self-register — no name/role here. Identity comes entirely
// from the Staff row an owner already created and assigned this phone to.
export const verifyStaffOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().length(6),
});
export type VerifyStaffOtpDto = z.infer<typeof verifyStaffOtpSchema>;
