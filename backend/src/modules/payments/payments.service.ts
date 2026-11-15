import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private verifySignature(rawBody: Buffer, signature: string): boolean {
    const secret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET', '');
    if (!secret) {
      this.logger.warn('RAZORPAY_WEBHOOK_SECRET not set — rejecting webhook (see §10 security requirements)');
      return false;
    }
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);
    return expectedBuf.length === signatureBuf.length && timingSafeEqual(expectedBuf, signatureBuf);
  }

  async handleRazorpayWebhook(rawBody: Buffer, signature: string) {
    if (!this.verifySignature(rawBody, signature)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const event = JSON.parse(rawBody.toString('utf8'));

    // TODO: replace with real Razorpay SDK event payload shape once
    // integration credentials are available. Expected flow per §7.3:
    // payment.captured -> mark Payment PAID + Booking CONFIRMED.
    if (event.event === 'payment.captured') {
      const providerOrderId = event.payload?.payment?.entity?.order_id;
      if (!providerOrderId) return { ok: true };

      const payment = await this.prisma.payment.findFirst({ where: { providerOrderId } });
      if (!payment) return { ok: true };

      await this.prisma.$transaction([
        this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'PAID' } }),
        this.prisma.booking.update({ where: { id: payment.bookingId }, data: { status: 'CONFIRMED' } }),
      ]);
      // TODO: enqueue confirmation notification (job queue not wired yet).
    }

    return { ok: true };
  }
}
