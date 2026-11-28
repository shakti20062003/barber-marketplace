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
import { CallBridgeService } from './call-bridge.service.js';
import { PushService } from '../../common/push/push.service.js';
import {
  BLOCKING_STATUSES,
  breaksFor,
  businessWindowFor,
  dbDateFor,
  fitsWindow,
  formatSalonTime,
  isBlocking,
  isEngaged,
  reminderPresetsFor,
  startOfLocalDay,
  staffWindowsFor,
} from '../../common/scheduling/schedule.js';
import type {
  AddServicesDto,
  CancelBookingDto,
  CompleteBookingDto,
  CreateBookingDto,
  MarkNoShowDto,
  RescheduleBookingDto,
} from './dto/create-booking.dto.js';

const DEFAULT_FREE_CANCELLATION_HOURS = 2; // §4.3 platform default
const NO_SHOW_ROLLING_WINDOW_DAYS = 90; // §4.5 / ADR-005
const NO_SHOW_PREPAYMENT_THRESHOLD = 2; // §4.5
// Anti-squatting: pay-at-shop costs nothing up front, so without caps one
// account could block a salon's whole day.
const MAX_UPCOMING_BOOKINGS_PER_CUSTOMER = 5;
const MAX_BOOKINGS_PER_SALON_PER_DAY = 2;

/**
 * Razorpay order creation is still a stub (see TODO in create()): a PAY_NOW
 * booking would sit PENDING, holding the slot, with no way to pay. Remove
 * this once online payment is wired up. (A plain function rather than an
 * inline check so TypeScript doesn't narrow away the PAY_NOW branches.)
 */
function assertPaymentMethodAvailable(method: string): void {
  if (method === 'PAY_NOW') {
    throw new BadRequestException('Online payment is coming soon. Please choose Pay at shop.');
  }
}

interface CancellationPolicy {
  freeCancellationHours: number;
  penaltyPercent: number;
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slotLock: SlotLockService,
    private readonly callBridge: CallBridgeService,
    private readonly push: PushService,
  ) {}

  private when(d: Date): string {
    return formatSalonTime(d);
  }

  /**
   * Push alert to the salon owner about one of their bookings. Fire-and-
   * forget — a notification problem must never fail the booking itself.
   */
  private async alertOwner(bookingId: string, title: string, detail?: string) {
    try {
      const b = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          business: { select: { ownerUserId: true } },
          customer: { select: { name: true } },
          service: { select: { name: true } },
          staff: { select: { name: true } },
        },
      });
      if (!b) return;
      this.push.notifyUser(b.business.ownerUserId, {
        title,
        body: `${b.customer.name} · ${b.service.name} · ${this.when(b.slotStart)}${b.staff ? ` · ${b.staff.name}` : ''}${detail ? ` · ${detail}` : ''}`,
        url: '/owner',
        tag: `booking-${b.id}`,
      });
    } catch {
      /* never block the booking flow */
    }
  }

  private policyFor(business: { cancellationPolicy: unknown }): CancellationPolicy {
    const raw = business.cancellationPolicy as Partial<CancellationPolicy> | null;
    return {
      freeCancellationHours: raw?.freeCancellationHours ?? DEFAULT_FREE_CANCELLATION_HOURS,
      penaltyPercent: raw?.penaltyPercent ?? 0,
    };
  }

  /**
   * Same rules as the availability grid (common/scheduling): inside the
   * salon's hours for that day, inside the staff member's windows, and not
   * overlapping any booking that still blocks. `excludeBookingId` lets a
   * booking be checked against everything except itself (reschedule,
   * adding services).
   */
  private async staffAvailableForSlot(
    staffId: string,
    slotStart: Date,
    slotEnd: Date,
    excludeBookingId?: string,
  ): Promise<boolean> {
    const day = startOfLocalDay(slotStart);
    const [staff, override, overlapping] = await Promise.all([
      this.prisma.staff.findUnique({
        where: { id: staffId },
        include: {
          availability: { where: { dayOfWeek: day.getDay() } },
          business: { select: { workingHours: true, lastBookingCutoffMinutes: true } },
        },
      }),
      this.prisma.staffAvailabilityOverride.findFirst({ where: { staffId, specificDate: dbDateFor(day) } }),
      this.prisma.booking.findMany({
        where: {
          staffId,
          id: excludeBookingId ? { not: excludeBookingId } : undefined,
          status: { in: BLOCKING_STATUSES },
          slotStart: { lt: slotEnd },
          slotEnd: { gt: slotStart },
        },
        select: { status: true, slotStart: true },
      }),
    ]);
    if (!staff || !staff.active) return false;
    const now = new Date();
    if (overlapping.some((b) => isBlocking(b, now))) return false;
    if (isEngaged(staff, slotStart, now)) return false;

    const windows = staffWindowsFor(
      day,
      businessWindowFor(staff.business.workingHours, day),
      staff.availability,
      override,
      breaksFor(staff.business.workingHours, day),
    );
    return windows.some((w) => fitsWindow(slotStart, slotEnd, w, staff.business.lastBookingCutoffMinutes));
  }

  private async findAnyAvailableStaff(
    businessId: string,
    slotStart: Date,
    slotEnd: Date,
    requireHomeServiceCapable = false,
  ): Promise<string | null> {
    const staffList = await this.prisma.staff.findMany({
      where: { businessId, active: true, ...(requireHomeServiceCapable ? { homeServiceCapable: true } : {}) },
    });
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
    assertPaymentMethodAvailable(dto.paymentMethod);
    let homeAddress: { formattedAddress: string } | null = null;
    if (dto.serviceLocationType === 'HOME_SERVICE') {
      if (!dto.addressId) {
        throw new BadRequestException('addressId is required for home service bookings');
      }
      const address = await this.prisma.address.findUnique({ where: { id: dto.addressId } });
      if (!address || address.userId !== customerId) {
        throw new ForbiddenException('This address does not belong to you');
      }
      homeAddress = address;
    }

    const slotStart = new Date(dto.slotStart);
    if (slotStart <= new Date()) {
      throw new BadRequestException('slotStart must be in the future');
    }
    const slotEnd = new Date(slotStart.getTime() + service.durationMinutes * 60_000);

    const upcoming = await this.prisma.booking.count({
      where: { customerId, status: { in: ['PENDING', 'CONFIRMED'] }, slotStart: { gt: new Date() } },
    });
    if (upcoming >= MAX_UPCOMING_BOOKINGS_PER_CUSTOMER) {
      throw new BadRequestException(
        `You already have ${upcoming} upcoming bookings. Please complete or cancel one before booking another.`,
      );
    }
    const dayStart = startOfLocalDay(slotStart);
    const sameSalonSameDay = await this.prisma.booking.count({
      where: {
        customerId,
        businessId: dto.businessId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        slotStart: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) },
      },
    });
    if (sameSalonSameDay >= MAX_BOOKINGS_PER_SALON_PER_DAY) {
      throw new BadRequestException(
        'You already have 2 bookings at this salon that day. Add services to an existing booking instead.',
      );
    }

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
        if (dto.serviceLocationType === 'HOME_SERVICE') {
          const chosen = await this.prisma.staff.findUnique({ where: { id: staffId } });
          if (!chosen || !chosen.homeServiceCapable) {
            throw new ConflictException('This stylist does not offer home visits');
          }
        }
        const available = await this.staffAvailableForSlot(staffId, slotStart, slotEnd);
        if (!available) throw new ConflictException('This staff member is not available for that slot');
      } else {
        staffId = await this.findAnyAvailableStaff(
          dto.businessId,
          slotStart,
          slotEnd,
          dto.serviceLocationType === 'HOME_SERVICE',
        );
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
            // Kept so the customer can see their code again under Upcoming
            // bookings. Only ever returned to the booking's own customer —
            // never in owner/staff payloads.
            otpCode: otp.code,
            ...reminderPresetsFor(slotStart, new Date()),
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

      void this.alertOwner(
        booking.id,
        dto.serviceLocationType === 'HOME_SERVICE' ? '🏠 New home-visit booking' : '🎉 New booking',
        homeAddress?.formattedAddress,
      );

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
        business: {
          select: {
            id: true,
            name: true,
            lat: true,
            lng: true,
            address: true,
            media: { take: 1, orderBy: { order: 'asc' } },
          },
        },
        service: { select: { id: true, name: true, price: true, durationMinutes: true } },
        staff: { select: { name: true } },
        review: { select: { id: true, rating: true, text: true } },
        payment: { select: { amount: true } },
        addOns: { include: { service: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
      },
    });

    return bookings.map((b) => ({
      id: b.id,
      slotStart: b.slotStart,
      slotEnd: b.slotEnd,
      status: b.status,
      business: {
        id: b.business.id,
        name: b.business.name,
        image: b.business.media[0]?.url ?? null,
        lat: b.business.lat,
        lng: b.business.lng,
        address: b.business.address,
      },
      service: { id: b.service.id, name: b.service.name, price: b.service.price, durationMinutes: b.service.durationMinutes },
      addOns: b.addOns.map((a) => ({
        id: a.id,
        name: a.service.name,
        price: a.price,
        durationMinutes: a.durationMinutes,
      })),
      totalAmount: b.payment?.amount ?? b.service.price,
      staff: b.staff ? { name: b.staff.name } : null,
      hasReview: b.review != null,
      review: b.review ? { rating: b.review.rating, text: b.review.text } : null,
      // Only while the code is still useful (before the visit is done).
      confirmationCode: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(b.status) ? b.otpCode : null,
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

    if (isCustomer) {
      void this.alertOwner(bookingId, '❌ Booking cancelled', dto.reason ? `“${dto.reason}”` : undefined);
    } else {
      this.push.notifyUser(booking.customerId, {
        title: '❌ Your booking was cancelled by the salon',
        body: `${booking.business.name} · ${booking.service.name} · ${this.when(booking.slotStart)}`,
        url: '/account',
        tag: `booking-${bookingId}`,
      });
    }

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
    const dateOnly = dbDateFor(startOfLocalDay(slotStart));

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
    if (booking.slotStart <= new Date()) {
      throw new BadRequestException('This booking has already started, so its time can no longer be changed.');
    }

    const newSlotStart = new Date(dto.slotStart);
    if (newSlotStart <= new Date()) throw new BadRequestException('slotStart must be in the future');
    const newSlotEnd = new Date(newSlotStart.getTime() + (booking.slotEnd.getTime() - booking.slotStart.getTime()));
    const newStaffId = dto.staffId ?? booking.staffId;

    const lockToken = await this.slotLock.acquire(booking.businessId, newStaffId ?? 'any', newSlotStart.toISOString());
    if (!lockToken) throw new ConflictException('The requested new slot is currently being booked by someone else');

    try {
      if (newStaffId) {
        const available = await this.staffAvailableForSlot(newStaffId, newSlotStart, newSlotEnd, bookingId);
        if (!available) throw new ConflictException('That time is no longer free — please pick another slot.');
      }

      // Atomic: the old slot is released and the new one held in the same
      // write (FR-4.2 AC) — there is no intermediate state with neither.
      const updated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.booking.update({
          where: { id: bookingId },
          data: {
            slotStart: newSlotStart,
            slotEnd: newSlotEnd,
            staffId: newStaffId,
            // Re-arm reminders for the new time (see reminderPresetsFor).
            ...reminderPresetsFor(newSlotStart, new Date()),
          },
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
      void this.alertOwner(bookingId, '🕐 Booking time changed', `was ${this.when(booking.slotStart)}`);
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
    if (actor.role === 'OWNER' && booking.business.ownerUserId !== actor.id) {
      throw new ForbiddenException('Not your salon');
    }
    if (actor.role === 'STAFF') {
      const staff = await this.prisma.staff.findUnique({ where: { userId: actor.id } });
      if (!staff || staff.businessId !== booking.businessId) {
        throw new ForbiddenException('Not your salon');
      }
    }
    if (booking.status !== 'CONFIRMED' && booking.status !== 'IN_PROGRESS') {
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

  /**
   * Salon checks the customer in. Moving to IN_PROGRESS is what keeps the
   * slot held past the 10-minute late grace period (see isBlocking).
   */
  async start(bookingId: string, actor: AuthenticatedUser) {
    const booking = await this.loadForActor(bookingId);
    if (actor.role !== 'OWNER' || booking.business.ownerUserId !== actor.id) {
      throw new ForbiddenException('Only the salon can check a customer in');
    }
    if (booking.status !== 'CONFIRMED') {
      throw new BadRequestException(`Cannot start a booking in status ${booking.status}`);
    }
    return this.prisma.booking.update({ where: { id: bookingId }, data: { status: 'IN_PROGRESS' } });
  }

  /**
   * Customer adds more services to an upcoming booking. The booking is
   * extended to cover the extra time — only if the same staff member is
   * still free for the longer slot — and the amount due goes up.
   */
  async addServices(bookingId: string, actor: AuthenticatedUser, dto: AddServicesDto) {
    const booking = await this.loadForActor(bookingId);
    if (booking.customerId !== actor.id) throw new ForbiddenException('Not your booking');
    if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
      throw new BadRequestException('Services can only be added to an upcoming booking');
    }
    if (booking.slotStart <= new Date()) {
      throw new BadRequestException('This booking has already started — ask the salon to add services');
    }

    const uniqueIds = [...new Set(dto.serviceIds)];
    const services = await this.prisma.service.findMany({
      where: { id: { in: uniqueIds }, businessId: booking.businessId, active: true },
    });
    if (services.length !== uniqueIds.length) {
      throw new NotFoundException('One or more services are not offered by this salon');
    }

    const extraMinutes = services.reduce((sum, s) => sum + s.durationMinutes, 0);
    const extraAmount = services.reduce((sum, s) => sum + Number(s.price), 0);
    const newSlotEnd = new Date(booking.slotEnd.getTime() + extraMinutes * 60_000);

    if (booking.staffId) {
      const free = await this.staffAvailableForSlot(booking.staffId, booking.slotStart, newSlotEnd, bookingId);
      if (!free) {
        throw new ConflictException(
          `Your stylist isn't free for the extra ${extraMinutes} min after this booking. Try fewer services, or book them separately.`,
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.bookingAddOn.createMany({
        data: services.map((s) => ({
          bookingId,
          serviceId: s.id,
          price: s.price,
          durationMinutes: s.durationMinutes,
        })),
      }),
      this.prisma.booking.update({ where: { id: bookingId }, data: { slotEnd: newSlotEnd } }),
      // Unpaid amounts simply grow; an already-paid booking pays the
      // difference at the salon.
      this.prisma.payment.updateMany({
        where: { bookingId, status: { in: ['CREATED', 'PENDING'] } },
        data: { amount: { increment: extraAmount } },
      }),
    ]);

    void this.alertOwner(bookingId, '➕ Services added', `+${services.map((s) => s.name).join(', ')}`);
    return { slotEnd: newSlotEnd, extraMinutes, extraAmount };
  }

  /** Masked call between the booking's customer and the salon owner (either direction). */
  async call(bookingId: string, actor: AuthenticatedUser) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: { select: { phone: true } },
        business: { select: { ownerUserId: true, owner: { select: { phone: true } } } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    const isCustomer = booking.customerId === actor.id;
    const isOwner = actor.role === 'OWNER' && booking.business.ownerUserId === actor.id;
    if (!isCustomer && !isOwner) throw new ForbiddenException('Not part of this booking');
    if (!['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(booking.status)) {
      throw new BadRequestException('Calling is only available for active bookings');
    }
    const customerPhone = booking.customer.phone;
    const salonPhone = booking.business.owner.phone;
    if (!customerPhone || !salonPhone) throw new BadRequestException('No phone number on file for this booking');

    await this.callBridge.connect(isCustomer ? customerPhone : salonPhone, isCustomer ? salonPhone : customerPhone);
    return { calling: true, message: 'We are calling your phone now. Pick up to be connected.' };
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
