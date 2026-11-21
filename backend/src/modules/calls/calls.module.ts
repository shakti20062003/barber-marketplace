import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { REDIS_CLIENT } from '../../common/redis/redis.constants.js';
import { PushService } from '../../common/push/push.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

/**
 * Free in-app voice calls between a booking's customer and its salon owner
 * (WebRTC, browser-to-browser). Nobody's phone number is used or shown.
 *
 * This server only does *signalling*: the caller's offer and the callee's
 * answer (SDP, with ICE candidates gathered up front — "non-trickle") are
 * exchanged through these endpoints and kept in Redis for the call's short
 * life. The callee is rung with a web-push notification that opens
 * /call/:id. Audio then flows directly between the two phones, encrypted
 * end to end by WebRTC (DTLS-SRTP).
 *
 * NAT traversal: Google's free STUN server by default. On networks where a
 * direct path isn't possible (some mobile carriers) calls need a TURN relay —
 * set TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL (free tiers exist).
 */

type CallState = 'ringing' | 'active' | 'ended' | 'declined' | 'missed';

interface CallRecord {
  id: string;
  bookingId: string;
  callerId: string;
  calleeId: string;
  /** What each side sees as "who's on the other end". */
  callerLabel: string;
  calleeLabel: string;
  topic: string;
  /** Where the callee's "missed call" notification should take them. */
  calleeHome: '/owner' | '/account';
  state: CallState;
  createdAt: number;
  answeredAt?: number;
  offer?: string;
  answer?: string;
}

const RING_TIMEOUT_MS = 45_000;
const CALL_TTL_SECONDS = 2 * 60 * 60;
const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'];

const sdpSchema = z.object({ sdp: z.string().min(10).max(20_000) });
type SdpDto = z.infer<typeof sdpSchema>;
const startSchema = z.object({ bookingId: z.string().uuid() });
type StartDto = z.infer<typeof startSchema>;

@Injectable()
export class CallsService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly config: ConfigService,
  ) {}

  private key(id: string) {
    return `call:${id}`;
  }

  private async load(id: string): Promise<CallRecord> {
    const raw = await this.redis.get(this.key(id));
    if (!raw) throw new NotFoundException('This call has ended.');
    const call = JSON.parse(raw) as CallRecord;
    if (call.state === 'ringing' && Date.now() - call.createdAt > RING_TIMEOUT_MS) {
      call.state = 'missed';
      await this.save(call);
    }
    return call;
  }

  private async save(call: CallRecord) {
    await this.redis.set(this.key(call.id), JSON.stringify(call), 'EX', CALL_TTL_SECONDS);
  }

  private participant(call: CallRecord, userId: string): 'caller' | 'callee' {
    if (call.callerId === userId) return 'caller';
    if (call.calleeId === userId) return 'callee';
    throw new ForbiddenException('Not part of this call');
  }

  iceServers() {
    const servers: { urls: string[]; username?: string; credential?: string }[] = [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    ];
    const turn = this.config.get<string>('TURN_URLS');
    if (turn) {
      servers.push({
        urls: turn.split(',').map((u) => u.trim()).filter(Boolean),
        username: this.config.get<string>('TURN_USERNAME'),
        credential: this.config.get<string>('TURN_CREDENTIAL'),
      });
    }
    return { iceServers: servers };
  }

  async start(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: { select: { id: true, name: true } },
        business: { select: { name: true, ownerUserId: true } },
        service: { select: { name: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    const isCustomer = booking.customerId === userId;
    const isOwner = booking.business.ownerUserId === userId;
    if (!isCustomer && !isOwner) throw new ForbiddenException('Not part of this booking');
    if (!ACTIVE_STATUSES.includes(booking.status)) {
      throw new BadRequestException('Calling is only available for upcoming or ongoing bookings.');
    }

    const calleeId = isCustomer ? booking.business.ownerUserId : booking.customerId;
    const reachable = await this.prisma.pushSubscription.count({ where: { userId: calleeId } });
    if (reachable === 0) {
      throw new ConflictException(
        isCustomer
          ? "The salon hasn't turned on Trimly notifications yet, so they can't receive in-app calls right now."
          : "This customer hasn't turned on Trimly notifications yet, so they can't receive in-app calls right now.",
      );
    }

    const call: CallRecord = {
      id: randomUUID(),
      bookingId,
      callerId: userId,
      calleeId,
      callerLabel: isCustomer ? booking.customer.name : booking.business.name,
      calleeLabel: isCustomer ? booking.business.name : booking.customer.name,
      topic: booking.service.name,
      calleeHome: isCustomer ? '/owner' : '/account',
      state: 'ringing',
      createdAt: Date.now(),
    };
    await this.save(call);

    this.push.notifyUser(calleeId, {
      title: `📞 Incoming call from ${call.callerLabel}`,
      body: `About your ${call.topic} booking — tap to answer`,
      url: `/call/${call.id}`,
      tag: `call-${call.id}`,
    });
    return { callId: call.id };
  }

  async view(userId: string, id: string) {
    const call = await this.load(id);
    const you = this.participant(call, userId);
    return {
      id: call.id,
      bookingId: call.bookingId,
      you,
      otherName: you === 'caller' ? call.calleeLabel : call.callerLabel,
      topic: call.topic,
      state: call.state,
      // Each side only needs the other side's description.
      offer: you === 'callee' ? (call.offer ?? null) : null,
      answer: you === 'caller' ? (call.answer ?? null) : null,
      ringsUntil: call.createdAt + RING_TIMEOUT_MS,
    };
  }

  async offer(userId: string, id: string, sdp: string) {
    const call = await this.load(id);
    if (this.participant(call, userId) !== 'caller') throw new ForbiddenException('Only the caller sends the offer');
    if (call.state !== 'ringing') throw new BadRequestException('This call is no longer ringing.');
    call.offer = sdp;
    await this.save(call);
    return { ok: true };
  }

  async answer(userId: string, id: string, sdp: string) {
    const call = await this.load(id);
    if (this.participant(call, userId) !== 'callee') throw new ForbiddenException('Only the person being called can answer');
    if (call.state !== 'ringing') throw new BadRequestException(call.state === 'missed' ? 'This call was missed.' : 'This call has ended.');
    if (!call.offer) throw new BadRequestException('The caller is still connecting — try again in a moment.');
    call.answer = sdp;
    call.state = 'active';
    call.answeredAt = Date.now();
    await this.save(call);
    return { ok: true };
  }

  async decline(userId: string, id: string) {
    const call = await this.load(id);
    if (this.participant(call, userId) !== 'callee') throw new ForbiddenException('Only the person being called can decline');
    if (call.state === 'ringing') {
      call.state = 'declined';
      await this.save(call);
    }
    return { state: call.state };
  }

  async end(userId: string, id: string) {
    const call = await this.load(id);
    const who = this.participant(call, userId);
    if (call.state === 'ringing' || call.state === 'active') {
      const wasRinging = call.state === 'ringing';
      call.state = 'ended';
      await this.save(call);
      if (wasRinging && who === 'caller') {
        // Caller gave up before it was answered: replace the ringing
        // notification (same tag) with a missed-call note.
        this.push.notifyUser(call.calleeId, {
          title: `Missed call from ${call.callerLabel}`,
          body: `About your ${call.topic} booking`,
          url: call.calleeHome,
          tag: `call-${call.id}`,
        });
      }
    }
    return { state: call.state };
  }
}

@Controller('calls')
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Get('ice-servers')
  ice() {
    return this.calls.iceServers();
  }

  @Post()
  start(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(startSchema)) dto: StartDto) {
    return this.calls.start(user.id, dto.bookingId);
  }

  @Get(':id')
  view(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.calls.view(user.id, id);
  }

  @Post(':id/offer')
  offer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodValidationPipe(sdpSchema)) dto: SdpDto) {
    return this.calls.offer(user.id, id, dto.sdp);
  }

  @Post(':id/answer')
  answer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodValidationPipe(sdpSchema)) dto: SdpDto) {
    return this.calls.answer(user.id, id, dto.sdp);
  }

  @Post(':id/decline')
  decline(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.calls.decline(user.id, id);
  }

  @Post(':id/end')
  end(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.calls.end(user.id, id);
  }
}

@Module({ controllers: [CallsController], providers: [CallsService] })
export class CallsModule {}
