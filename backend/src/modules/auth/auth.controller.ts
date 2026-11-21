import { Body, Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthenticatedUser } from './strategies/jwt.strategy.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { sendOtpSchema, verifyOtpSchema, type SendOtpDto, type VerifyOtpDto } from './dto/otp.dto.js';

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
  @Post('google')
  google(@Body(new ZodValidationPipe(googleLoginSchema)) dto: GoogleLoginDto) {
    return this.auth.googleLogin(dto.credential, dto.role);
  }

  /** Signed-in user attaches a Google account (keeps their data when phone login is turned off). */
  @Post('google/link')
  linkGoogle(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(googleLinkSchema)) dto: GoogleLinkDto) {
    return this.auth.linkGoogle(user.id, dto.credential);
  }

  @Public()
  @Post('otp/send')
  send(@Body(new ZodValidationPipe(sendOtpSchema)) dto: SendOtpDto) {
    return this.auth.sendOtp(dto);
  }

  @Public()
  @Post('otp/verify')
  verify(@Body(new ZodValidationPipe(verifyOtpSchema)) dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto);
  }
}
