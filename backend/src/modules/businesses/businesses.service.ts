import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { boundingBox, haversineDistanceKm } from '../../common/geo/haversine.js';
import type { SearchBusinessesDto } from './dto/search-businesses.dto.js';
import type { CreateBusinessDto, UpdateBusinessDto } from './dto/create-business.dto.js';
import type { CreateServiceDto, UpdateServiceDto } from './dto/service.dto.js';
import type { CreateStaffDto, UpdateStaffDto } from './dto/staff.dto.js';
import type { AvailabilityQueryDto } from './dto/availability-query.dto.js';
import type { CreateMediaDto } from './dto/media.dto.js';
import { computeAchievements, earnedBadges } from './achievements.js';
import {
  SLOT_STEP_MINUTES,
  BLOCKING_STATUSES,
  breaksFor,
  businessWindowFor,
  dbDateFor,
  fitsWindow,
  isBlocking,
  isEngaged,
  isPastGrace,
  isOpenAt,
  localDayStart,
  staffWindowsFor,
  todaysHours,
} from '../../common/scheduling/schedule.js';

/** Bookings made this recently get a "NEW" badge on the owner dashboard. */
const NEW_BOOKING_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class BusinessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private searchWeights() {
    return {
      distance: this.config.get<number>('SEARCH_WEIGHT_DISTANCE', 0.4),
      rating: this.config.get<number>('SEARCH_WEIGHT_RATING', 0.4),
      availability: this.config.get<number>('SEARCH_WEIGHT_AVAILABILITY', 0.2),
    };
  }

  /**
   * Bounding-box pre-filter in SQL, exact Haversine distance + ranking in
   * application code. Sufficient at MVP scale (§ADR-003); replace with
   * PostGIS ST_DWithin/GIST once salon density or query complexity grows.
   */
  private async candidateBusinesses(dto: SearchBusinessesDto, relaxed: { category?: boolean; minRating?: boolean } = {}) {
    const box = boundingBox(dto.lat, dto.lng, dto.radiusKm);
    const candidates = await this.prisma.business.findMany({
      where: {
        verificationStatus: 'VERIFIED',
        lat: { gte: box.minLat, lte: box.maxLat },
        lng: { gte: box.minLng, lte: box.maxLng },
        category: relaxed.category ? undefined : dto.category ? { equals: dto.category, mode: 'insensitive' } : undefined,
        name: dto.q ? { contains: dto.q, mode: 'insensitive' } : undefined,
      },
      include: {
        media: { orderBy: { order: 'asc' }, take: 1 },
        services: { where: { active: true }, orderBy: { price: 'asc' }, take: 1 },
        reviews: { select: { rating: true }, orderBy: { createdAt: 'desc' } },
        _count: { select: { bookings: { where: { status: { in: ['COMPLETED', 'REVIEWED'] } } } } },
        trustBadges: true,
        homeServiceAreas: true,
      },
    });

    const weights = this.searchWeights();

    const scored = candidates
      .map((b) => {
        const distanceKm = haversineDistanceKm(dto.lat, dto.lng, b.lat, b.lng);
        const avgRating =
          b.reviews.length > 0 ? b.reviews.reduce((s, r) => s + r.rating, 0) / b.reviews.length : 0;
        const openNow = isOpenAt(b.workingHours);
        if (distanceKm > dto.radiusKm) return null;
        if (dto.openNow && !openNow) return null;
        if (!relaxed.minRating && dto.minRating && avgRating < dto.minRating) return null;
        if (dto.homeService && b.homeServiceAreas.length === 0) return null;

        const distanceScore = 1 - distanceKm / dto.radiusKm;
        const ratingScore = avgRating / 5;
        const availabilityScore = openNow ? 1 : 0.5; // crude MVP proxy — see class docstring below
        const score =
          distanceScore * weights.distance +
          ratingScore * weights.rating +
          availabilityScore * weights.availability;

        return {
          id: b.id,
          name: b.name,
          category: b.category,
          image: b.media[0]?.url ?? null,
          rating: Math.round(avgRating * 10) / 10,
          reviewCount: b.reviews.length,
          distanceKm: Math.round(distanceKm * 10) / 10,
          startingPrice: b.services[0]?.price ?? null,
          openNow,
          todayHours: todaysHours(b.workingHours),
          achievements: earnedBadges(
            computeAchievements({
              avgRating,
              reviewCount: b.reviews.length,
              recentRatings: b.reviews.slice(0, 5).map((r) => r.rating),
              completedVisits: b._count.bookings,
              createdAt: b.createdAt,
            }),
          ),
          trustBadges: b.trustBadges.map((t) => t.badgeType),
          score,
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .sort((a, b) => b.score - a.score);

    return scored;
  }

  async search(dto: SearchBusinessesDto) {
    let results = await this.candidateBusinesses(dto);
    let relaxedFilters: string[] = [];

    // AC: empty results show relaxed-filter suggestions, never a dead end.
    if (results.length === 0 && dto.minRating) {
      results = await this.candidateBusinesses(dto, { minRating: true });
      if (results.length > 0) relaxedFilters = ['minRating'];
    }
    if (results.length === 0 && dto.category) {
      results = await this.candidateBusinesses(dto, { category: true, minRating: true });
      if (results.length > 0) relaxedFilters = [...relaxedFilters, 'category'];
    }

    const start = (dto.page - 1) * dto.limit;
    const page = results.slice(start, start + dto.limit);

    return {
      results: page.map(({ score: _score, ...card }) => card),
      total: results.length,
      page: dto.page,
      limit: dto.limit,
      relaxedFilters: relaxedFilters.length > 0 ? relaxedFilters : undefined,
    };
  }

  async findById(id: string) {
    const business = await this.prisma.business.findUnique({
      where: { id },
      include: {
        city: true,
        media: { orderBy: { order: 'asc' } },
        trustBadges: true,
        services: { where: { active: true } },
        staff: {
          where: { active: true },
          include: { certifications: true },
        },
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { media: true, customer: { select: { name: true } } },
        },
        homeServiceAreas: { select: { id: true } },
      },
    });
    if (!business || business.verificationStatus !== 'VERIFIED') {
      // Unverified salons must never leak into results (§4.4).
      throw new NotFoundException('Business not found');
    }
    const achievements = await this.achievementsFor(business.id, business.createdAt);
    // Radius/polygon/travel-fee stay internal (unused this phase) — only
    // whether home service exists at all is exposed to the frontend.
    const { homeServiceAreas, ...rest } = business;
    return {
      ...rest,
      // phone/userId/engagedUntil are a barber's own login details, never
      // public — the salon's own stylist list must never leak them.
      staff: rest.staff.map(({ phone: _phone, userId: _userId, engagedUntil: _engagedUntil, ...s }) => s),
      hasHomeService: homeServiceAreas.length > 0,
      openNow: isOpenAt(business.workingHours),
      todayHours: todaysHours(business.workingHours),
      achievements: earnedBadges(achievements),
    };
  }

  /** Public barber profile — 404s unless the affiliated salon is itself VERIFIED (mirrors findById). */
  async findStaffById(staffId: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      include: {
        business: { select: { id: true, name: true, verificationStatus: true, trustBadges: true, city: { select: { name: true } } } },
        certifications: true,
        portfolioMedia: true,
      },
    });
    if (!staff || !staff.active || staff.business.verificationStatus !== 'VERIFIED') {
      throw new NotFoundException('Staff member not found');
    }
    // phone/userId/engagedUntil are a barber's own login details, never public.
    const { userId: _userId, phone: _phone, engagedUntil: _engagedUntil, ...rest } = staff;
    return rest;
  }

  /** Full achievement list (earned + progress) from all-time reviews and completed visits. */
  private async achievementsFor(businessId: string, createdAt: Date) {
    const [agg, recent, completedVisits] = await Promise.all([
      this.prisma.review.aggregate({ where: { businessId }, _avg: { rating: true }, _count: true }),
      this.prisma.review.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { rating: true },
      }),
      this.prisma.booking.count({ where: { businessId, status: { in: ['COMPLETED', 'REVIEWED'] } } }),
    ]);
    return computeAchievements({
      avgRating: agg._avg.rating ?? 0,
      reviewCount: agg._count,
      recentRatings: recent.map((r) => r.rating),
      completedVisits,
      createdAt,
    });
  }

  async findByOwner(ownerUserId: string) {
    return this.prisma.business.findMany({ where: { ownerUserId }, include: { media: { take: 1 } } });
  }

  async findForOwner(businessId: string, ownerUserId: string) {
    await this.assertOwnership(businessId, ownerUserId);
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      include: {
        city: true,
        media: { orderBy: { order: 'asc' } },
        services: true,
        staff: true,
      },
    });
    if (!business) return business;
    return {
      ...business,
      staff: business.staff.map(({ userId, ...s }) => ({ ...s, hasLogin: !!userId })),
    };
  }

  async assertOwnership(businessId: string, ownerUserId: string) {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found');
    if (business.ownerUserId !== ownerUserId) {
      throw new ForbiddenException('You do not own this business');
    }
    return business;
  }

  async create(ownerUserId: string, dto: CreateBusinessDto) {
    return this.prisma.business.create({
      data: { ...dto, ownerUserId, workingHours: dto.workingHours as object },
    });
  }

  async update(businessId: string, ownerUserId: string, dto: UpdateBusinessDto) {
    await this.assertOwnership(businessId, ownerUserId);
    return this.prisma.business.update({
      where: { id: businessId },
      data: { ...dto, workingHours: dto.workingHours as object | undefined },
    });
  }

  async addService(businessId: string, ownerUserId: string, dto: CreateServiceDto) {
    await this.assertOwnership(businessId, ownerUserId);
    return this.prisma.service.create({ data: { ...dto, businessId } });
  }

  async updateService(businessId: string, serviceId: string, ownerUserId: string, dto: UpdateServiceDto) {
    await this.assertOwnership(businessId, ownerUserId);
    const existing = await this.prisma.service.findUnique({ where: { id: serviceId } });
    if (!existing || existing.businessId !== businessId) throw new NotFoundException('Service not found');
    return this.prisma.service.update({ where: { id: serviceId }, data: dto });
  }

  async addStaff(businessId: string, ownerUserId: string, dto: CreateStaffDto) {
    await this.assertOwnership(businessId, ownerUserId);
    return this.prisma.staff.create({ data: { ...dto, businessId } });
  }

  async updateStaff(businessId: string, staffId: string, ownerUserId: string, dto: UpdateStaffDto) {
    await this.assertOwnership(businessId, ownerUserId);
    const existing = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!existing || existing.businessId !== businessId) throw new NotFoundException('Staff member not found');
    // Reassigning the login number disconnects whoever was linked to the old
    // one — otherwise the next person to verify the new number would log
    // into the previous barber's account (the lookup in verifyStaffOtp()
    // goes through Staff.userId, which would still point at them).
    const phoneChanged = dto.phone && dto.phone !== existing.phone;
    if (phoneChanged) {
      const [takenByUser, takenByStaff] = await Promise.all([
        this.prisma.user.findUnique({ where: { phone: dto.phone } }),
        this.prisma.staff.findUnique({ where: { phone: dto.phone } }),
      ]);
      if (takenByUser || (takenByStaff && takenByStaff.id !== staffId)) {
        throw new ConflictException('This phone number is already registered to a different account.');
      }
    }
    return this.prisma.staff.update({
      where: { id: staffId },
      data: { ...dto, userId: phoneChanged ? null : undefined },
    });
  }

  async addMedia(businessId: string, ownerUserId: string, dto: CreateMediaDto) {
    await this.assertOwnership(businessId, ownerUserId);
    const count = await this.prisma.businessMedia.count({ where: { businessId } });
    return this.prisma.businessMedia.create({ data: { ...dto, businessId, order: count } });
  }

  async removeMedia(businessId: string, mediaId: string, ownerUserId: string) {
    await this.assertOwnership(businessId, ownerUserId);
    const media = await this.prisma.businessMedia.findUnique({ where: { id: mediaId } });
    if (!media || media.businessId !== businessId) throw new NotFoundException('Photo not found');
    await this.prisma.businessMedia.delete({ where: { id: mediaId } });
    return { deleted: true };
  }

  /**
   * Bookable start times for a service on a date, plus a per-time "how busy"
   * grid for the BookMyShow-style colour coding on the booking page.
   *
   * Every staff member's windows are clipped to the salon's working hours
   * for that day (a salon closed that day has no slots at all — this used to
   * be ignored, so a salon showing "Closed" was still bookable). Start times
   * are offered every SLOT_STEP_MINUTES; a staff member is free for a start
   * time if [start, start + duration) sits inside one of their windows and
   * overlaps no booking that still blocks (see isBlocking: late, un-started
   * bookings release their time after the grace period).
   */
  async availability(businessId: string, query: AvailabilityQueryDto) {
    const [service, business] = await Promise.all([
      this.prisma.service.findUnique({ where: { id: query.serviceId } }),
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { workingHours: true, lastBookingCutoffMinutes: true },
      }),
    ]);
    if (!service || service.businessId !== businessId || !business) {
      throw new NotFoundException('Service not found for this business');
    }

    const staffList = await this.prisma.staff.findMany({
      where: {
        businessId,
        active: true,
        ...(query.staffId ? { id: query.staffId } : {}),
        ...(query.homeService ? { homeServiceCapable: true } : {}),
      },
      include: { availability: true },
    });
    if (query.staffId && staffList.length === 0) {
      throw new NotFoundException('Staff member not found for this business');
    }

    const day = localDayStart(query.date);
    const dayEnd = new Date(day.getTime() + 86_400_000);
    const businessWindow = businessWindowFor(business.workingHours, day);
    const durationMs = service.durationMinutes * 60_000;

    const empty = {
      date: query.date,
      serviceId: query.serviceId,
      closed: !businessWindow,
      hours: businessWindow ? { open: businessWindow.start.toISOString(), close: businessWindow.end.toISOString() } : null,
      grid: [] as { start: string; end: string; available: number; total: number; staffIds: string[] }[],
      slots: [] as { staffId: string; start: string; end: string }[],
    };
    if (!businessWindow || staffList.length === 0) return empty;

    const [overrides, bookings] = await Promise.all([
      this.prisma.staffAvailabilityOverride.findMany({
        where: { staffId: { in: staffList.map((s) => s.id) }, specificDate: dbDateFor(day) },
      }),
      this.prisma.booking.findMany({
        where: {
          businessId,
          staffId: { in: staffList.map((s) => s.id) },
          status: { in: BLOCKING_STATUSES },
          slotStart: { lt: dayEnd },
          slotEnd: { gt: day },
        },
        select: { staffId: true, status: true, slotStart: true, slotEnd: true },
      }),
    ]);

    const now = new Date();
    const blocking = bookings.filter((b) => isBlocking(b, now));
    const dow = day.getDay();
    const salonBreaks = breaksFor(business.workingHours, day);
    const staffWindows = staffList.map((s) => ({
      id: s.id,
      engagedUntil: s.engagedUntil,
      windows: staffWindowsFor(
        day,
        businessWindow,
        s.availability.filter((a) => a.dayOfWeek === dow),
        overrides.find((o) => o.staffId === s.id) ?? null,
        salonBreaks,
      ),
    }));

    const grid: typeof empty.grid = [];
    for (
      let t = businessWindow.start.getTime();
      t < businessWindow.end.getTime();
      t += SLOT_STEP_MINUTES * 60_000
    ) {
      const start = new Date(t);
      const end = new Date(t + durationMs);
      if (start <= now) continue;
      const working = staffWindows.filter((s) =>
        s.windows.some((w) => fitsWindow(start, end, w, business.lastBookingCutoffMinutes)),
      );
      if (working.length === 0) continue;
      const free = working.filter(
        (s) =>
          !blocking.some((b) => b.staffId === s.id && start < b.slotEnd && end > b.slotStart) &&
          !isEngaged(s, start, now),
      );
      grid.push({
        start: start.toISOString(),
        end: end.toISOString(),
        available: free.length,
        total: working.length,
        staffIds: free.map((s) => s.id),
      });
    }

    return {
      ...empty,
      grid,
      slots: grid.flatMap((g) => g.staffIds.map((staffId) => ({ staffId, start: g.start, end: g.end }))),
    };
  }

  async ownerDashboard(ownerUserId: string, businessId: string) {
    const owned = await this.assertOwnership(businessId, ownerUserId);
    const achievements = await this.achievementsFor(businessId, owned.createdAt);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const weekEnd = new Date(todayEnd.getTime() + 7 * 86_400_000);
    const [todaysBookings, cancellationsToday, revenueAgg, upcoming] = await Promise.all([
      this.prisma.booking.findMany({
        where: { businessId, slotStart: { gte: todayStart, lte: todayEnd } },
        // Customer phone deliberately omitted: calls go through the masked
        // call bridge (POST /bookings/:id/call), never a visible number.
        include: {
          service: true,
          customer: { select: { name: true } },
          staff: true,
          addOns: { include: { service: { select: { name: true } } } },
        },
        orderBy: { slotStart: 'asc' },
      }),
      this.prisma.booking.count({
        where: { businessId, status: 'CANCELLED', slotStart: { gte: todayStart, lte: todayEnd } },
      }),
      this.prisma.payment.aggregate({
        where: {
          status: 'PAID',
          booking: { businessId, slotStart: { gte: todayStart, lte: todayEnd } },
        },
        _sum: { amount: true },
      }),
      // After today, next 7 days — so owners see what's coming, not just today.
      this.prisma.booking.findMany({
        where: {
          businessId,
          slotStart: { gt: todayEnd, lte: weekEnd },
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
        select: {
          id: true,
          slotStart: true,
          slotEnd: true,
          status: true,
          createdAt: true,
          service: { select: { name: true } },
          customer: { select: { name: true } },
          staff: { select: { name: true } },
        },
        orderBy: { slotStart: 'asc' },
        take: 50,
      }),
    ]);

    const now = new Date();
    return {
      todaysBookings: todaysBookings.map(({ otpHash: _h, otpCode: _c, ...b }) => ({
        ...b,
        lateNoShowCandidate: isPastGrace(b, now),
        isNew: now.getTime() - b.createdAt.getTime() < NEW_BOOKING_MS,
      })),
      upcomingBookings: upcoming.map((b) => ({ ...b, isNew: now.getTime() - b.createdAt.getTime() < NEW_BOOKING_MS })),
      cancellationsToday,
      revenueToday: revenueAgg._sum.amount ?? 0,
      achievements,
    };
  }
}
