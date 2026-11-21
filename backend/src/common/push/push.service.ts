import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { generateVapidKeys, sendWebPush, type VapidKeys } from './web-push.js';

export interface PushMessage {
  title: string;
  body: string;
  /** Page to open when the notification is tapped. */
  url: string;
  /** Same tag replaces an older notification instead of stacking. */
  tag?: string;
}

const VAPID_SETTING = 'vapid_keys';

/**
 * Web push for the whole app (registered in the @Global PushModule).
 * The VAPID key pair is generated on first use and stored in app_settings,
 * so no env setup is needed. Never let a push failure break the request
 * that triggered it — callers use `notifyUser(...)` fire-and-forget.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private keys: Promise<VapidKeys> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private subject(): string {
    return this.config.get<string>('VAPID_SUBJECT') || 'https://trimly-backend-3w0i.onrender.com';
  }

  private vapidKeys(): Promise<VapidKeys> {
    if (!this.keys) {
      this.keys = (async () => {
        const existing = await this.prisma.appSetting.findUnique({ where: { key: VAPID_SETTING } });
        if (existing) return JSON.parse(existing.value) as VapidKeys;
        const created = generateVapidKeys();
        // upsert so two instances racing on first boot converge on one key pair
        const saved = await this.prisma.appSetting.upsert({
          where: { key: VAPID_SETTING },
          update: {},
          create: { key: VAPID_SETTING, value: JSON.stringify(created) },
        });
        return JSON.parse(saved.value) as VapidKeys;
      })().catch((err) => {
        this.keys = null;
        throw err;
      });
    }
    return this.keys;
  }

  async publicKey(): Promise<string> {
    return (await this.vapidKeys()).publicKey;
  }

  async subscribe(userId: string, sub: { endpoint: string; p256dh: string; auth: string }) {
    // An endpoint belongs to one browser; re-subscribing (or a new user on
    // the same phone) just moves it.
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { userId, p256dh: sub.p256dh, auth: sub.auth },
      create: { userId, ...sub },
    });
    return { subscribed: true };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { subscribed: false };
  }

  async isSubscribed(userId: string, endpoint: string) {
    const found = await this.prisma.pushSubscription.findFirst({ where: { userId, endpoint } });
    return { subscribed: !!found };
  }

  /** Sends to every device of a user; returns how many accepted it. */
  async sendToUser(userId: string, message: PushMessage): Promise<number> {
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return 0;
    const keys = await this.vapidKeys();
    let delivered = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          const status = await sendWebPush(s, message, keys, this.subject());
          if (status === 404 || status === 410) {
            // Browser unsubscribed / expired — stop trying.
            await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          } else if (status >= 200 && status < 300) {
            delivered++;
          } else {
            this.logger.warn(`Push to ${new URL(s.endpoint).host} returned ${status}`);
          }
        } catch (err) {
          this.logger.warn(`Push failed: ${err instanceof Error ? err.message : err}`);
        }
      }),
    );
    await this.prisma.notificationLog
      .create({
        data: { userId, channel: 'push', template: message.tag ?? 'generic', status: delivered > 0 ? 'SENT' : 'FAILED' },
      })
      .catch(() => {});
    return delivered;
  }

  /** Fire-and-forget: never throws, never delays the caller. */
  notifyUser(userId: string, message: PushMessage): void {
    void this.sendToUser(userId, message).catch((err) =>
      this.logger.warn(`notifyUser failed: ${err instanceof Error ? err.message : err}`),
    );
  }
}
