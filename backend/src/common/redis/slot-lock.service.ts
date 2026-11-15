import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { REDIS_CLIENT } from './redis.constants.js';

const DEFAULT_HOLD_MS = 5 * 60 * 1000; // §7.2: short-TTL hold on (businessId, staffId, slot)

// Releases the lock only if the caller still owns the token, so one
// request can never release a lock another request just acquired after
// this one's hold expired (classic Redis distributed-lock pitfall).
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

@Injectable()
export class SlotLockService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(businessId: string, staffId: string | null, slotStartIso: string): string {
    return `slot-lock:${businessId}:${staffId ?? 'any'}:${slotStartIso}`;
  }

  /** Acquires the hold, returning a release token, or null if already held. */
  async acquire(
    businessId: string,
    staffId: string | null,
    slotStartIso: string,
    holdMs: number = DEFAULT_HOLD_MS,
  ): Promise<string | null> {
    const token = randomUUID();
    const result = await this.redis.set(
      this.key(businessId, staffId, slotStartIso),
      token,
      'PX',
      holdMs,
      'NX',
    );
    return result === 'OK' ? token : null;
  }

  async release(
    businessId: string,
    staffId: string | null,
    slotStartIso: string,
    token: string,
  ): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, 1, this.key(businessId, staffId, slotStartIso), token);
  }
}
