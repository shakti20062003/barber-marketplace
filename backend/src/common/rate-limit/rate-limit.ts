import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants.js';

/**
 * Simple Redis fixed-window rate limiting (@nestjs/throttler doesn't support
 * Nest 12 yet). Registered as a global guard after auth, so per-user limits
 * can key on the signed-in user.
 *
 *  - Every request: GLOBAL_PER_IP_PER_MINUTE per client IP.
 *  - Sensitive routes add their own limit with @RateLimit(...).
 *
 * Fails open: if Redis is unavailable, requests are allowed rather than
 * taking the whole API down.
 */

export interface RateLimitRule {
  /** Bucket name, e.g. 'booking-create'. */
  name: string;
  limit: number;
  windowSeconds: number;
  /** 'user' falls back to IP for unauthenticated requests. */
  by: 'user' | 'ip';
}

const RATE_LIMIT_KEY = 'rate_limit_rule';
export const RateLimit = (rule: RateLimitRule) => SetMetadata(RATE_LIMIT_KEY, rule);

const GLOBAL_PER_IP_PER_MINUTE = 300;

interface Req {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
  user?: { id: string };
}

/**
 * Client IP behind Render's proxy (Cloudflare in front). Uses Cloudflare's
 * header when present, otherwise the right-most X-Forwarded-For hop (the one
 * our proxy appended — left-most entries can be forged by the client).
 */
export function clientIp(req: Req): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf.trim();
  const xff = req.headers['x-forwarded-for'];
  const hops = (Array.isArray(xff) ? xff.join(',') : (xff ?? '')).split(',').map((s) => s.trim()).filter(Boolean);
  return hops.at(-1) ?? req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private async hit(key: string, windowSeconds: number): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, windowSeconds);
    return count;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Req>();
    const ip = clientIp(req);
    try {
      const minute = Math.floor(Date.now() / 60_000);
      if ((await this.hit(`rl:ip:${ip}:${minute}`, 60)) > GLOBAL_PER_IP_PER_MINUTE) {
        throw new HttpException('Too many requests. Please slow down and try again in a minute.', HttpStatus.TOO_MANY_REQUESTS);
      }

      const rule = this.reflector.getAllAndOverride<RateLimitRule | undefined>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (rule) {
        const who = rule.by === 'user' && req.user?.id ? `u:${req.user.id}` : `ip:${ip}`;
        const windowIndex = Math.floor(Date.now() / (rule.windowSeconds * 1000));
        if ((await this.hit(`rl:${rule.name}:${who}:${windowIndex}`, rule.windowSeconds)) > rule.limit) {
          throw new HttpException(
            'You’re doing that too often. Please wait a little and try again.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.warn(`Rate limiter unavailable, allowing request: ${err instanceof Error ? err.message : err}`);
      return true;
    }
  }
}
