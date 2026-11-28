import { z } from 'zod';

// Fails fast on boot if the environment is misconfigured, rather than
// surfacing confusing errors later at request time.
export const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),

  SMS_PROVIDER_API_KEY: z.string().optional().default(''),

  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),

  WEB_APP_URL: z.string().default('http://localhost:3000'),
  WEB_APP_URL_PATTERN: z.string().optional(),

  // Masked calling (Exotel). All four required to enable calls.
  EXOTEL_SID: z.string().optional(),
  EXOTEL_API_KEY: z.string().optional(),
  EXOTEL_API_TOKEN: z.string().optional(),
  EXOTEL_CALLER_ID: z.string().optional(),
  EXOTEL_SUBDOMAIN: z.string().optional(),

  // Sign in with Google (free). OAuth "Web application" client id from Google Cloud.
  GOOGLE_CLIENT_ID: z.string().optional(),
  // 'off' disables phone-OTP login for customers/owners (do this in
  // production until SMS exists: the OTP is shown on screen, so anyone
  // could log in as any number).
  PHONE_LOGIN: z.enum(['on', 'off']).optional(),
  // Separate flag for barber login (also on-screen OTP, same mechanism).
  // Defaults to 'on' even when PHONE_LOGIN is off: a Staff phone must
  // already be assigned by the salon owner before anyone can log in with
  // it (no open self-registration like customer/owner phone login), so the
  // founder accepted the smaller residual risk — someone who already knows
  // a specific barber's private phone number — to keep barber login working
  // without paid SMS.
  STAFF_PHONE_LOGIN: z.enum(['on', 'off']).optional(),
  // Comma-separated Google emails that become/link the admin account.
  ADMIN_EMAILS: z.string().optional(),

  // Optional TURN relay for in-app calls on networks where direct WebRTC fails.
  TURN_URLS: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_CREDENTIAL: z.string().optional(),

  // Web push contact (mailto: or https URL) sent to push services; keys are auto-generated.
  VAPID_SUBJECT: z.string().optional(),

  // FR-2.1 AC: default sort weighting must be configurable, not hardcoded.
  SEARCH_WEIGHT_DISTANCE: z.coerce.number().default(0.4),
  SEARCH_WEIGHT_RATING: z.coerce.number().default(0.4),
  SEARCH_WEIGHT_AVAILABILITY: z.coerce.number().default(0.2),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}
