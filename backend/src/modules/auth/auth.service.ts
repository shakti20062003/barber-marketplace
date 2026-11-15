import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt } from 'node:crypto';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { SendOtpDto, VerifyOtpDto } from './dto/otp.dto.js';

const OTP_TTL_SECONDS = 5 * 60; // FR-1.1 AC: expires in 5 minutes
const OTP_MAX_ATTEMPTS = 5; // FR-1.1 AC: max 5 attempts
const OTP_RATE_LIMIT_WINDOW_SECONDS = 10 * 60;
const OTP_RATE_LIMIT_MAX_SENDS = 3; // FR-1.1 AC: 3 sends per 10 minutes per number

interface StoredOtp {
  hash: string;
  attempts: number;
}

function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private otpKey(phone: string) {
    return `otp:${phone}`;
  }

  private rateLimitKey(phone: string) {
    return `otp:rate:${phone}`;
  }

  async sendOtp({ phone }: SendOtpDto): Promise<{ sent: true; devOtp?: string }> {
    const sends = await this.redis.incr(this.rateLimitKey(phone));
    if (sends === 1) {
      await this.redis.expire(this.rateLimitKey(phone), OTP_RATE_LIMIT_WINDOW_SECONDS);
    }
    if (sends > OTP_RATE_LIMIT_MAX_SENDS) {
      throw new HttpException(
        'Too many OTP requests for this number. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const record: StoredOtp = { hash: hashOtp(code), attempts: 0 };
    await this.redis.set(this.otpKey(phone), JSON.stringify(record), 'EX', OTP_TTL_SECONDS);

    // TODO: wire to an SMS provider (MSG91/Gupshup per §7.2). Until then,
    // log the code in non-production so the flow is testable locally, and
    // hand it back in the response too — there's no real SMS to receive it
    // on, so the frontend shows it directly rather than making dev testing
    // depend on tailing the API's console output.
    const isProd = this.config.get('NODE_ENV') === 'production';
    if (isProd) {
      this.logger.log(`OTP dispatched to ${phone}`);
    } else {
      this.logger.debug(`OTP for ${phone}: ${code}`);
    }

    return { sent: true, devOtp: isProd ? undefined : code };
  }

  async verifyOtp({ phone, code, name, role }: VerifyOtpDto) {
    const raw = await this.redis.get(this.otpKey(phone));
    if (!raw) {
      throw new BadRequestException('OTP expired or was never requested. Request a new one.');
    }

    const record: StoredOtp = JSON.parse(raw);
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      await this.redis.del(this.otpKey(phone));
      throw new HttpException(
        'Too many incorrect attempts. Request a new OTP.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (record.hash !== hashOtp(code)) {
      record.attempts += 1;
      await this.redis.set(
        this.otpKey(phone),
        JSON.stringify(record),
        'KEEPTTL',
      );
      throw new UnauthorizedException('Incorrect OTP');
    }

    // Single-use: OTP is consumed on successful verification.
    await this.redis.del(this.otpKey(phone));

    let user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      // Role is fixed at this first-creation moment only (FR-1.2) — it is
      // never mutated by a later call to this same endpoint.
      user = await this.prisma.user.create({
        data: {
          phone,
          name: name ?? 'New user',
          role,
          authProvider: 'PHONE_OTP',
        },
      });
      if (user.role === 'CUSTOMER') {
        await this.prisma.customerProfile.create({ data: { userId: user.id } });
      }
    }

    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return {
      accessToken,
      user: { id: user.id, name: user.name, role: user.role, phone: user.phone },
    };
  }
}
