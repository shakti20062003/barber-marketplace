import { createHash, randomInt } from 'node:crypto';

export function generateBookingOtp(): { code: string; hash: string } {
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  return { code, hash: hashBookingOtp(code) };
}

export function hashBookingOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
