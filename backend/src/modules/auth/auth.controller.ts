import { Body, Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthenticatedUser } from './strategies/jwt.strategy.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.js';
import {
  sendOtpSchema,
  verifyOtpSchema,
  verifyStaffOtpSchema,
  type SendOtpDto,
  type VerifyOtpDto,
  type VerifyStaffOtpDto,
} from './dto/otp.dto.js';

const googleLoginSchema = z.object({
  credential: z.string().min(20).max(5000),
  // Only used the first time this Google account signs up (FR-1.2).
  role: z.enum(['CUSTOMER', 'OWNER']).default('CUSTOMER'),
});
type GoogleLoginDto = z.infer<typeof googleLoginSchema>;

const googleLinkSchema = z.object({ credential: z.string().min(20).max(5000) });
type GoogleLinkDto = z.infer<typeof googleLinkSchema>;

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Which login methods the login screen should offer. */
  @Public()
  @Get('methods')
  methods() {
    return this.auth.methods();
  }

  @Public()
  @RateLimit({ name: 'auth-google', limit: 20, windowSeconds: 600, by: 'ip' })
  @Post('google')
  google(@Body(new ZodValidationPipe(googleLoginSchema)) dto: GoogleLoginDto) {
    return this.auth.googleLogin(dto.credential, dto.role);
  }

  /** Signed-in user attaches a Google account (keeps their data when phone login is turned off). */
  @RateLimit({ name: 'auth-google-link', limit: 10, windowSeconds: 600, by: 'user' })
  @Post('google/link')
  linkGoogle(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(googleLinkSchema)) dto: GoogleLinkDto) {
    return this.auth.linkGoogle(user.id, dto.credential);
  }

  @Public()
  @RateLimit({ name: 'otp-send-ip', limit: 10, windowSeconds: 600, by: 'ip' })
  @Post('otp/send')
  send(@Body(new ZodValidationPipe(sendOtpSchema)) dto: SendOtpDto) {
    return this.auth.sendOtp(dto);
  }

  @Public()
  @RateLimit({ name: 'otp-verify-ip', limit: 30, windowSeconds: 600, by: 'ip' })
  @Post('otp/verify')
  verify(@Body(new ZodValidationPipe(verifyOtpSchema)) dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto);
  }

  /** Barber login — identity comes from a Staff row an owner already created, never self-registration. */
  @Public()
  @RateLimit({ name: 'otp-verify-staff-ip', limit: 30, windowSeconds: 600, by: 'ip' })
  @Post('otp/verify-staff')
  verifyStaff(@Body(new ZodValidationPipe(verifyStaffOtpSchema)) dto: VerifyStaffOtpDto) {
    return this.auth.verifyStaffOtp(dto);
  }
}
