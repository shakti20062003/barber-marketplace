import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { BookingStatus } from 'database';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SlotLockService } from '../../common/redis/slot-lock.service.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';
import { generateBookingOtp, hashBookingOtp } from './otp.util.js';
import type {
  CancelBookingDto,
  CompleteBookingDto,
  CreateBookingDto,
  MarkNoShowDto,
  RescheduleBookingDto,
} from './dto/create-booking.dto.js';

const ACTIVE_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'];
const DEFAULT_FREE_CANCELLATION_HOURS = 2; // §4.3 platform default
const NO_SHOW_ROLLING_WINDOW_DAYS = 90; // §4.5 / ADR-005
const NO_SHOW_PREPAYMENT_THRESHOLD = 2; // §4.5

interface CancellationPolicy {
  freeCancellationHours: number;
  penaltyPercent: number;
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slotLock: SlotLockService,
  ) {}

  private policyFor(business: { cancellationPolicy: unknown }): CancellationPolicy {
    const raw = business.cancellationPolicy as Partial<CancellationPolicy> | null;
    return {
      freeCancellationHours: raw?.freeCancellationHours ?? DEFAULT_FREE_CANCELLATION_HOURS,
      penaltyPercent: raw?.penaltyPercent ?? 0,
    };
  }

  private async staffAvailableForSlot(staffId: string, slotStart: Date, slotEnd: Date): Promise<boolean> {
    const dayOfWeek = slotStart.getDay();
    const dateOnly = new Date(slotStart);
    dateOnly.setHours(0, 0, 0, 0);

    const [weekly, override, overlapping] = await Promise.all([
      this.prisma.staffAvailability.findMany({ where: { staffId, dayOfWeek } }),
      this.prisma.staffAvailabilityOverride.findFirst({ where: { staffId, specificDate: dateOnly } }),
      this.prisma.booking.findFirst({
        where: {
          staffId,
          status: { in: ACTIVE_STATUSES },
          slotStart: { lt: slotEnd },
          slotEnd: { gt: slotStart },
        },
      }),
    ]);

    if (overlapping) return false;
    if (override?.isClosed) return false;

    const windows = override?.startTime && override.endTime ? [override] : weekly;
    return windows.some((w) => {
      const [sh, sm] = w.startTime!.split(':').map(Number);
      const [eh, em] = w.endTime!.split(':').map(Number);
      const windowStart = new Date(dateOnly);
      windowStart.setHours(sh, sm, 0, 0);
      const windowEnd = new Date(dateOnly);
      windowEnd.setHours(eh, em, 0, 0);
      return slotStart >= windowStart && slotEnd <= windowEnd;
    });
  }

  private async findAnyAvailableStaff(businessId: string, slotStart: Date, slotEnd: Date): Promise<string | null> {
    const staffList = await this.prisma.staff.findMany({ where: { businessId, active: true } });
    for (const staff of staffList) {
      if (await this.staffAvailableForSlot(staff.id, slotStart, slotEnd)) return staff.id;
    }
    return null;
  }

  async create(customerId: string, dto: CreateBookingDto) {
    const service = await this.prisma.service.findUnique({ where: { id: dto.serviceId } });
    if (!service || service.businessId !== dto.businessId || !service.active) {
      throw new NotFoundException('Service not found for this business');
    }
    const business = await this.prisma.business.findUnique({ where: { id: dto.businessId } });
    if (!business || business.verificationStatus !== 'VERIFIED') {
      throw new NotFoundException('Business not found');
    }
    if (dto.serviceLocationType === 'HOME_SERVICE' && !dto.addressId) {
      throw new BadRequestException('addressId is required for home service bookings');
    }

    const slotStart = new Date(dto.slotStart);
    if (slotStart <= new Date()) {
      throw new BadRequestException('slotStart must be in the future');
    }
    const slotEnd = new Date(slotStart.getTime() + service.durationMinutes * 60_000);

    // §4.5: a flagged customer loses the pay-at-shop option until their
    // reliability score recovers — reversible, never a permanent ban.
    const customerProfile = await this.prisma.customerProfile.findUnique({ where: { userId: customerId } });
    if (customerProfile?.requiresPrepayment && dto.paymentMethod === 'PAY_AT_SHOP') {
      throw new BadRequestException(
        'This account requires prepayment for new bookings due to recent no-shows.',
      );
    }

    let staffId = dto.staffId ?? null;
    const lockKeyStaffId = staffId ?? 'any';
    const lockToken = await this.slotLock.acquire(dto.businessId, lockKeyStaffId, slotStart.toISOString());
    if (!lockToken) {
      throw new ConflictException('This slot is currently being booked by someone else. Try another.');
    }

    try {
      if (staffId) {
        const available = await this.staffAvailableForSlot(staffId, slotStart, slotEnd);
        if (!available) throw new ConflictException('This staff member is not available for that slot');
      } else {
        staffId = await this.findAnyAvailableStaff(dto.businessId, slotStart, slotEnd);
        if (!staffId) throw new ConflictException('No staff available for that slot');
      }

      const otp = generateBookingOtp();
      const initialStatus: BookingStatus = dto.paymentMethod === 'PAY_NOW' ? 'PENDING' : 'CONFIRMED';

      const booking = await this.prisma.$transaction(async (tx) => {
        const created = await tx.booking.create({
          data: {
            customerId,
            businessId: dto.businessId,
            staffId,
            serviceId: dto.serviceId,
            slotStart,
            slotEnd,
            status: initialStatus,
            serviceLocationType: dto.serviceLocationType,
            addressId: dto.addressId,
            otpHash: otp.hash,
          },
        });
        await tx.payment.create({
          data: {
            bookingId: created.id,
            amount: service.price,
            provider: dto.paymentMethod === 'PAY_NOW' ? 'razorpay' : 'cash',
            status: dto.paymentMethod === 'PAY_NOW' ? 'CREATED' : 'PENDING',
          },
        });
        return created;
      });

      // Pay-at-shop is confirmed immediately, so the DB row is now the
      // authoritative collision guard — release the hold right away.
      // Pay-now keeps the hold until the Razorpay webhook confirms payment
      // (or it expires, per the TTL set in SlotLockService).
      if (dto.paymentMethod === 'PAY_AT_SHOP') {
        await this.slotLock.release(dto.businessId, lockKeyStaffId, slotStart.toISOString(), lockToken);
      }

      // TODO: enqueue confirmation notification to customer + business
      // (FR-4.1 AC: within 5s) once the job queue (BullMQ) is wired up.
      // TODO: for PAY_NOW, create the actual Razorpay order here.

      return {
        booking,
        otp: dto.paymentMethod === 'PAY_AT_SHOP' ? otp.code : undefined, // shown in-app once confirmed
        payment:
          dto.paymentMethod === 'PAY_NOW'
            ? { requiresPayment: true, amount: service.price, razorpayOrderId: null as string | null }
            : { requiresPayment: false, amount: service.price },
      };
    } catch (err) {
      if (dto.paymentMethod === 'PAY_AT_SHOP') {
        // lock already released on the success path only — release here on any failure path too
        await this.slotLock.release(dto.businessId, lockKeyStaffId, slotStart.toISOString(), lockToken);
      }
      throw err;
    }
  }

  async findForCustomer(customerId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { customerId },
      orderBy: { slotStart: 'desc' },
      include: {
        business: { select: { id: true, name: true, media: { take: 1, orderBy: { order: 'asc' } } } },
        service: { select: { name: true, price: true, durationMinutes: true } },
        staff: { select: { name: true } },
        review: { select: { id: true } },
      },
    });

    return bookings.map((b) => ({
      id: b.id,
      slotStart: b.slotStart,
      slotEnd: b.slotEnd,
      status: b.status,
      business: { id: b.business.id, name: b.business.name, image: b.business.media[0]?.url ?? null },
      service: { name: b.service.name, price: b.service.price, durationMinutes: b.service.durationMinutes },
      staff: b.staff ? { name: b.staff.name } : null,
      hasReview: b.review != null,
    }));
  }

  private async loadForActor(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { business: true, service: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async cancel(bookingId: string, actor: AuthenticatedUser, dto: CancelBookingDto) {
    const booking = await this.loadForActor(bookingId);
    const isCustomer = booking.customerId === actor.id;
    const isOwner = actor.role === 'OWNER' && booking.business.ownerUserId === actor.id;
    if (!isCustomer && !isOwner) throw new ForbiddenException('Not authorized to cancel this booking');
    if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
      throw new BadRequestException(`Cannot cancel a booking in status ${booking.status}`);
    }

    const payment = await this.prisma.payment.findUnique({ where: { bookingId } });
    let refundAmount = 0;

    if (payment && payment.status === 'PAID') {
      if (isOwner) {
        // Salon-initiated cancellation: always full refund (§4.3).
        refundAmount = Number(payment.amount);
      } else {
        const policy = this.policyFor(booking.business);
        const hoursUntilSlot = (booking.slotStart.getTime() - Date.now()) / 3_600_000;
        refundAmount =
          hoursUntilSlot >= policy.freeCancellationHours
            ? Number(payment.amount)
            : Number(payment.amount) * (1 - policy.penaltyPercent / 100);
      }
    }

    const [updatedBooking] = await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED', cancellationReason: dto.reason ?? (isOwner ? 'Cancelled by salon' : 'Cancelled by customer') },
      }),
      ...(payment && payment.status === 'PAID'
        ? [
            this.prisma.payment.update({
              where: { bookingId },
              data: {
                refundAmount,
                status: refundAmount >= Number(payment.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
              },
            }),
          ]
        : []),
    ]);

    // TODO: dispatch cancellation notification (+ apology/priority-rebooking
    // suggestion when salon-initiated) via the job queue.
    await this.notifyWaitlistForFreedSlot(booking.businessId, booking.serviceId, booking.staffId, booking.slotStart);

    return { booking: updatedBooking, refundAmount };
  }

  /**
   * §4.6: notifies the longest-waiting matching waitlist entry that a slot
   * opened up. Reuses the same slot-hold mechanism a normal booking uses so
   * two waitlisted customers can never claim the same freed slot. The actual
   * claim-window timeout (auto-advance to the next person) needs a scheduled
   * job once BullMQ is wired up — this only performs the first notify step.
   */
  private async notifyWaitlistForFreedSlot(
    businessId: string,
    serviceId: string,
    staffId: string | null,
    slotStart: Date,
  ) {
    const dateOnly = new Date(slotStart);
    dateOnly.setHours(0, 0, 0, 0);

    const entry = await this.prisma.waitlistEntry.findFirst({
      where: {
        businessId,
        serviceId,
        staffId: staffId ?? undefined,
        desiredDate: dateOnly,
        status: 'WAITING',
      },
      orderBy: { id: 'asc' },
    });
    if (!entry) return;

    await this.prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: { status: 'NOTIFIED', notifiedAt: new Date() },
    });
    // TODO: push/SMS notification to entry.customerId with a claim link.
  }

  async reschedule(bookingId: string, actor: AuthenticatedUser, dto: RescheduleBookingDto) {
    const booking = await this.loadForActor(bookingId);
    if (booking.customerId !== actor.id) throw new ForbiddenException('Not authorized to reschedule this booking');
    if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
      throw new BadRequestException(`Cannot reschedule a booking in status ${booking.status}`);
    }

    const newSlotStart = new Date(dto.slotStart);
    if (newSlotStart <= new Date()) throw new BadRequestException('slotStart must be in the future');
    const newSlotEnd = new Date(newSlotStart.getTime() + booking.service.durationMinutes * 60_000);
    const newStaffId = dto.staffId ?? booking.staffId;

    const lockToken = await this.slotLock.acquire(booking.businessId, newStaffId ?? 'any', newSlotStart.toISOString());
    if (!lockToken) throw new ConflictException('The requested new slot is currently being booked by someone else');

    try {
      if (newStaffId) {
        const available = await this.staffAvailableForSlot(newStaffId, newSlotStart, newSlotEnd);
        if (!available) throw new ConflictException('That staff member is not available for the new slot');
      }

      // Atomic: the old slot is released and the new one held in the same
      // write (FR-4.2 AC) — there is no intermediate state with neither.
      const updated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.booking.update({
          where: { id: bookingId },
          data: { slotStart: newSlotStart, slotEnd: newSlotEnd, staffId: newStaffId },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'BOOKING_RESCHEDULED',
            entityType: 'Booking',
            entityId: bookingId,
            metadata: { from: booking.slotStart, to: newSlotStart },
          },
        });
        return result;
      });

      await this.slotLock.release(booking.businessId, newStaffId ?? 'any', newSlotStart.toISOString(), lockToken);
      return updated;
    } catch (err) {
      await this.slotLock.release(booking.businessId, newStaffId ?? 'any', newSlotStart.toISOString(), lockToken);
      throw err;
    }
  }

  async complete(bookingId: string, actor: AuthenticatedUser, dto: CompleteBookingDto) {
    const booking = await this.loadForActor(bookingId);
    if (!(actor.role === 'OWNER' || actor.role === 'STAFF')) {
      throw new ForbiddenException('Only salon staff can mark a booking complete');
    }
    if (booking.status !== 'CONFIRMED') {
      throw new BadRequestException(`Cannot complete a booking in status ${booking.status}`);
    }
    if (!booking.otpHash || hashBookingOtp(dto.otp) !== booking.otpHash) {
      throw new UnauthorizedException('Incorrect OTP');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.booking.update({ where: { id: bookingId }, data: { status: 'COMPLETED' } }),
      this.prisma.payment.updateMany({
        where: { bookingId, status: 'PENDING' },
        data: { status: 'PAID' }, // cash collected at shop, confirmed by staff
      }),
      this.prisma.customerProfile.update({
        where: { userId: booking.customerId },
        data: { reliabilityScore: { increment: 2 } },
      }),
    ]);

    return updated;
  }

  async markNoShow(bookingId: string, actor: AuthenticatedUser, dto: MarkNoShowDto) {
    const booking = await this.loadForActor(bookingId);
    if (actor.role !== 'OWNER' || booking.business.ownerUserId !== actor.id) {
      throw new ForbiddenException('Only the salon owner can mark a no-show');
    }
    if (booking.status !== 'CONFIRMED') {
      throw new BadRequestException(`Cannot mark a booking in status ${booking.status} as a no-show`);
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'NO_SHOW', noShowReasonCode: dto.reasonCode },
    });

    const rollingWindowStart = new Date(Date.now() - NO_SHOW_ROLLING_WINDOW_DAYS * 86_400_000);
    const rollingNoShowCount = await this.prisma.booking.count({
      where: { customerId: booking.customerId, status: 'NO_SHOW', slotStart: { gte: rollingWindowStart } },
    });

    await this.prisma.customerProfile.update({
      where: { userId: booking.customerId },
      data: {
        noShowCountRolling: rollingNoShowCount,
        reliabilityScore: { decrement: 15 },
        requiresPrepayment: rollingNoShowCount >= NO_SHOW_PREPAYMENT_THRESHOLD,
      },
    });

    return updated;
  }
}
