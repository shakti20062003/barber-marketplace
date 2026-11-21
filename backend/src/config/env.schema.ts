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
