import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Masked calling between a customer and a salon: neither side ever sees the
 * other's number. Uses Exotel's "connect two numbers" API — Exotel first
 * rings `from`, and when they pick up, dials `to`, with the platform's
 * ExoPhone shown as caller ID on both legs.
 *
 * Needs an Exotel account (EXOTEL_SID / EXOTEL_API_KEY / EXOTEL_API_TOKEN /
 * EXOTEL_CALLER_ID). Without those, calls are refused with a clear message
 * rather than falling back to exposing a number.
 */
@Injectable()
export class CallBridgeService {
  private readonly logger = new Logger(CallBridgeService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(
      this.config.get('EXOTEL_SID') &&
        this.config.get('EXOTEL_API_KEY') &&
        this.config.get('EXOTEL_API_TOKEN') &&
        this.config.get('EXOTEL_CALLER_ID'),
    );
  }

  async connect(from: string, to: string): Promise<void> {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'In-app calling is coming soon. For now, please use the booking details in the app.',
      );
    }
    const sid = this.config.get<string>('EXOTEL_SID')!;
    const key = this.config.get<string>('EXOTEL_API_KEY')!;
    const token = this.config.get<string>('EXOTEL_API_TOKEN')!;
    const host = this.config.get<string>('EXOTEL_SUBDOMAIN') || 'api.exotel.com';

    const res = await fetch(`https://${host}/v1/Accounts/${encodeURIComponent(sid)}/Calls/connect.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: from,
        To: to,
        CallerId: this.config.get<string>('EXOTEL_CALLER_ID')!,
      }),
    });
    if (!res.ok) {
      this.logger.error(`Exotel connect failed: ${res.status} ${await res.text().catch(() => '')}`);
      throw new ServiceUnavailableException('Could not place the call right now. Please try again.');
    }
  }
}
