import { Body, Controller, Get, Global, Module, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../decorators/current-user.decorator.js';
import { Public } from '../decorators/public.decorator.js';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../../modules/auth/strategies/jwt.strategy.js';
import { PushService } from './push.service.js';

const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});
type SubscribeDto = z.infer<typeof subscribeSchema>;

const endpointSchema = z.object({ endpoint: z.string().url().max(1000) });
type EndpointDto = z.infer<typeof endpointSchema>;

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Public()
  @Get('public-key')
  async publicKey() {
    return { publicKey: await this.push.publicKey() };
  }

  @Post('subscribe')
  subscribe(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(subscribeSchema)) dto: SubscribeDto) {
    return this.push.subscribe(user.id, { endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth });
  }

  @Post('unsubscribe')
  unsubscribe(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(endpointSchema)) dto: EndpointDto) {
    return this.push.unsubscribe(user.id, dto.endpoint);
  }

  @Post('status')
  status(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(endpointSchema)) dto: EndpointDto) {
    return this.push.isSubscribed(user.id, dto.endpoint);
  }

  /** "Send me a test notification" button. */
  @Post('test')
  async test(@CurrentUser() user: AuthenticatedUser) {
    const delivered = await this.push.sendToUser(user.id, {
      title: '🔔 Trimly alerts are on',
      body: "This is a test. You'll get a notification like this for every new booking.",
      url: user.role === 'OWNER' ? '/owner' : '/account',
      tag: 'test',
    });
    return { delivered };
  }
}

@Global()
@Module({
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
