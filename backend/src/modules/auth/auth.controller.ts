import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { sendOtpSchema, verifyOtpSchema, type SendOtpDto, type VerifyOtpDto } from './dto/otp.dto.js';

@Controller('auth/otp')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('send')
  send(@Body(new ZodValidationPipe(sendOtpSchema)) dto: SendOtpDto) {
    return this.auth.sendOtp(dto);
  }

  @Public()
  @Post('verify')
  verify(@Body(new ZodValidationPipe(verifyOtpSchema)) dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto);
  }
}
