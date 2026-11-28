import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import type { SendOtpDto, VerifyOtpDto, VerifyStaffOtpDto } from './dto/otp.dto.js';
import { GoogleIdTokenVerifier, GoogleTokenError } from './google-id-token.js';
import type { User } from 'database';

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
  private readonly google = new GoogleIdTokenVerifier();

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ---- Which login methods are on --------------------------------------

  private googleClientId(): string | null {
    return this.config.get<string>('GOOGLE_CLIENT_ID') || null;
  }

  /**
   * Phone-OTP login. Until an SMS provider exists the code is shown on
   * screen (devOtp) — fine for testing, but on a public site it lets anyone
   * log in as any number. Set PHONE_LOGIN=off in production once Google
   * sign-in is configured.
   */
  phoneLoginEnabled(): boolean {
    return (this.config.get<string>('PHONE_LOGIN') ?? 'on').toLowerCase() !== 'off';
  }

  /**
   * Barber login is gated separately from customer/owner phone login: a
   * Staff phone must already be assigned by the salon owner, so it isn't
   * open self-registration the way customer/owner phone login is. Defaults
   * to on even when PHONE_LOGIN=off.
   */
  staffPhoneLoginEnabled(): boolean {
    return (this.config.get<string>('STAFF_PHONE_LOGIN') ?? 'on').toLowerCase() !== 'off';
  }

  methods() {
    const clientId = this.googleClientId();
    return { google: clientId ? { clientId } : null, phone: this.phoneLoginEnabled() };
  }

  private adminEmails(): Set<string> {
    return new Set(
      (this.config.get<string>('ADMIN_EMAILS') ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  private async issue(user: User) {
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        phone: user.phone,
        email: user.email,
        avatarUrl: user.avatarUrl,
        googleLinked: !!user.googleSub,
      },
    };
  }

  private async verifyGoogle(credential: string) {
    const clientId = this.googleClientId();
    if (!clientId) throw new BadRequestException('Google sign-in is not set up yet.');
    try {
      return await this.google.verify(credential, clientId);
    } catch (err) {
      this.logger.warn(`Google token rejected: ${err instanceof Error ? err.message : err}`);
      throw new UnauthorizedException(
        err instanceof GoogleTokenError ? 'Google sign-in failed. Please try again.' : 'Could not verify Google sign-in.',
      );
    }
  }

  // ---- Google sign-in --------------------------------------------------

  /**
   * Sign in (or sign up) with a Google ID token. One Google account maps to
   * exactly one Trimly user (`googleSub` is unique). An existing account
   * with the same verified email is linked rather than duplicated. Role is
   * only taken from the request when the account is first created (FR-1.2).
   */
  async googleLogin(credential: string, role: 'CUSTOMER' | 'OWNER') {
    const id = await this.verifyGoogle(credential);

    let user = await this.prisma.user.findUnique({ where: { googleSub: id.sub } });

    if (!user) {
      const byEmail = await this.prisma.user.findUnique({ where: { email: id.email } });
      if (byEmail) {
        if (byEmail.googleSub && byEmail.googleSub !== id.sub) {
          throw new ConflictException('This email is already linked to a different Google account.');
        }
        user = await this.prisma.user.update({ where: { id: byEmail.id }, data: { googleSub: id.sub } });
      }
    }

    if (!user && this.adminEmails().has(id.email)) {
      // Allow-listed admin: attach to the existing (seeded) admin account if
      // it isn't linked yet, otherwise create one.
      const seededAdmin = await this.prisma.user.findFirst({
        where: { role: 'ADMIN', googleSub: null },
        orderBy: { createdAt: 'asc' },
      });
      user = seededAdmin
        ? await this.prisma.user.update({
            where: { id: seededAdmin.id },
            data: { googleSub: id.sub, email: seededAdmin.email ?? id.email },
          })
        : await this.prisma.user.create({
            data: { role: 'ADMIN', name: id.name ?? 'Admin', email: id.email, googleSub: id.sub, authProvider: 'GOOGLE' },
          });
    }

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          role,
          name: id.name ?? 'New user',
          email: id.email,
          googleSub: id.sub,
          avatarUrl: id.picture,
          authProvider: 'GOOGLE',
        },
      });
      if (user.role === 'CUSTOMER') {
        await this.prisma.customerProfile.create({ data: { userId: user.id } });
      }
    }

    return this.issue(user);
  }

  /**
   * Attach a Google account to the signed-in user (e.g. an account created
   * with phone OTP), so it keeps its data when phone login is switched off.
   */
  async linkGoogle(userId: string, credential: string) {
    const id = await this.verifyGoogle(credential);
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (me.googleSub === id.sub) return this.issue(me);
    if (me.googleSub) throw new ConflictException('Your account is already linked to a different Google account.');

    const owner = await this.prisma.user.findUnique({ where: { googleSub: id.sub } });
    if (owner) throw new ConflictException('This Google account is already linked to another Trimly account.');
    const emailOwner = await this.prisma.user.findUnique({ where: { email: id.email } });
    if (emailOwner && emailOwner.id !== me.id) {
      throw new ConflictException('This Google email is already used by another Trimly account.');
    }

    const updated = await this.prisma.user.update({
      where: { id: me.id },
      data: { googleSub: id.sub, email: me.email ?? id.email },
    });
    return this.issue(updated);
  }

  // ---- Phone OTP ---------------------------------------------------------

  private otpKey(phone: string) {
    return `otp:${phone}`;
  }

  private rateLimitKey(phone: string) {
    return `otp:rate:${phone}`;
  }

  async sendOtp({ phone }: SendOtpDto): Promise<{ sent: true; devOtp?: string }> {
    // A number already assigned as a Staff login goes through the barber
    // gate, not the customer/owner one — the two can be toggled
    // independently (see staffPhoneLoginEnabled()).
    const staffPhone = await this.prisma.staff.findUnique({ where: { phone }, select: { id: true } });
    const enabled = staffPhone ? this.staffPhoneLoginEnabled() : this.phoneLoginEnabled();
    if (!enabled) {
      throw new ForbiddenException('Phone login is not available yet. Please continue with Google.');
    }
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

  /**
   * Redis lookup → attempts check → hash check → single-use delete. Which
   * phone-login gate applies is the caller's job (verifyOtp vs
   * verifyStaffOtp) — this just consumes whatever code was already sent.
   */
  private async consumeOtp(phone: string, code: string): Promise<void> {
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
  }

  async verifyOtp({ phone, code, name, role }: VerifyOtpDto) {
    if (!this.phoneLoginEnabled()) {
      throw new ForbiddenException('Phone login is not available yet. Please continue with Google.');
    }
    await this.consumeOtp(phone, code);

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
          phoneVerified: true,
        },
      });
      if (user.role === 'CUSTOMER') {
        await this.prisma.customerProfile.create({ data: { userId: user.id } });
      }
    }

    return this.issue(user);
  }

  /**
   * A barber never self-registers: this only ever logs in to a `Staff` row
   * an owner already created and assigned a phone to (FR-1.2 — role is
   * permanent, so STAFF accounts can only come from a salon vouching for
   * someone, never a public "I am a barber" signup).
   */
  async verifyStaffOtp({ phone, code }: VerifyStaffOtpDto) {
    if (!this.staffPhoneLoginEnabled()) {
      throw new ForbiddenException('Phone login is not available yet. Please continue with Google.');
    }
    await this.consumeOtp(phone, code);

    const staff = await this.prisma.staff.findUnique({ where: { phone } });
    if (!staff) {
      throw new ForbiddenException(
        'This phone number is not registered as staff by any salon. Ask your salon owner to add you.',
      );
    }

    let user = staff.userId ? await this.prisma.user.findUnique({ where: { id: staff.userId } }) : null;
    if (!user) {
      try {
        user = await this.prisma.user.create({
          data: { phone, name: staff.name, role: 'STAFF', authProvider: 'PHONE_OTP', phoneVerified: true },
        });
      } catch (err) {
        if ((err as { code?: string }).code === 'P2002') {
          throw new ConflictException('This phone number is already registered to a different Trimly account.');
        }
        throw err;
      }
      await this.prisma.staff.update({ where: { id: staff.id }, data: { userId: user.id } });
    }

    return this.issue(user);
  }
}
