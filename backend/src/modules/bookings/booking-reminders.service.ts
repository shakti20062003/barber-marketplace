import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PushService } from '../../common/push/push.service.js';
import { REMINDER_1H_LEAD_MS, REMINDER_24H_LEAD_MS, formatSalonTime } from '../../common/scheduling/schedule.js';

type ReminderField = 'reminder24hSentAt' | 'reminder1hSentAt';

interface ReminderKind {
  field: ReminderField;
  leadMs: number;
  title: string;
  tag: string;
}

const REMINDER_KINDS: ReminderKind[] = [
  { field: 'reminder24hSentAt', leadMs: REMINDER_24H_LEAD_MS, title: '⏰ Appointment tomorrow', tag: 'reminder-24h' },
  { field: 'reminder1hSentAt', leadMs: REMINDER_1H_LEAD_MS, title: '⏰ Appointment in an hour', tag: 'reminder-1h' },
];

/**
 * Pre-visit reminder push (FR-10.1: T-24h, T-1h) — "your booking is coming
 * up", like a calendar reminder. Polls instead of using a real job queue
 * (PRD §7.2 suggests BullMQ): this app runs a single backend instance on
 * Render's free tier, so a few-minutes-late reminder is an acceptable
 * trade-off for not running Redis-backed workers. `reminderPresetsFor`
 * (common/scheduling/schedule.ts) pre-marks a reminder "sent" at
 * create/reschedule time when its lead window has already passed, so this
 * loop only ever has to ask "is it time yet", never "should this have fired
 * already".
 */
@Injectable()
export class BookingRemindersService {
  private readonly logger = new Logger(BookingRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendDueReminders(): Promise<void> {
    for (const kind of REMINDER_KINDS) {
      await this.sendBatch(kind);
    }
  }

  private async sendBatch(kind: ReminderKind): Promise<void> {
    const now = new Date();
    const due = await this.prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        [kind.field]: null,
        slotStart: { gt: now, lte: new Date(now.getTime() + kind.leadMs) },
      },
      include: { business: { select: { name: true } }, service: { select: { name: true } } },
      take: 200,
    });

    for (const b of due) {
      try {
        // Mark sent before pushing: a push failure must not cause a retry
        // loop every 5 minutes (PushService.notifyUser never throws anyway).
        await this.prisma.booking.update({ where: { id: b.id }, data: { [kind.field]: now } });
        this.push.notifyUser(b.customerId, {
          title: kind.title,
          body: `${b.service.name} at ${b.business.name} · ${formatSalonTime(b.slotStart)}`,
          url: '/account',
          tag: `${kind.tag}-${b.id}`,
        });
      } catch (err) {
        this.logger.warn(`reminder (${kind.field}) failed for booking ${b.id}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
}
