import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { boundingBox, haversineDistanceKm } from '../../common/geo/haversine.js';
import type { SearchBusinessesDto } from './dto/search-businesses.dto.js';
import type { CreateBusinessDto, UpdateBusinessDto } from './dto/create-business.dto.js';
import type { CreateServiceDto, UpdateServiceDto } from './dto/service.dto.js';
import type { CreateStaffDto, UpdateStaffDto } from './dto/staff.dto.js';
import type { AvailabilityQueryDto } from './dto/availability-query.dto.js';
import type { CreateMediaDto } from './dto/media.dto.js';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function isOpenNow(workingHours: unknown): boolean {
  if (!workingHours || typeof workingHours !== 'object') return false;
  const now = new Date();
  const dayKey = DAY_KEYS[now.getDay()];
  const today = (workingHours as Record<string, { open: string; close: string; closed: boolean }>)[
    dayKey
  ];
  if (!today || today.closed) return false;
  const [openH, openM] = today.open.split(':').map(Number);
  const [closeH, closeM] = today.close.split(':').map(Number);
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  return minutesNow >= openH * 60 + openM && minutesNow <= closeH * 60 + closeM;
}

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
        reviews: { select: { rating: true } },
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
        const openNow = isOpenNow(b.workingHours);
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
      },
    });
    if (!business || business.verificationStatus !== 'VERIFIED') {
      // Unverified salons must never leak into results (§4.4).
      throw new NotFoundException('Business not found');
    }
    return business;
  }

  async findByOwner(ownerUserId: string) {
    return this.prisma.business.findMany({ where: { ownerUserId }, include: { media: { take: 1 } } });
  }

  async findForOwner(businessId: string, ownerUserId: string) {
    await this.assertOwnership(businessId, ownerUserId);
    return this.prisma.business.findUnique({
      where: { id: businessId },
      include: {
        city: true,
        media: { orderBy: { order: 'asc' } },
        services: true,
        staff: true,
      },
    });
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
    return this.prisma.service.update({ where: { id: serviceId }, data: dto });
  }

  async addStaff(businessId: string, ownerUserId: string, dto: CreateStaffDto) {
    await this.assertOwnership(businessId, ownerUserId);
    return this.prisma.staff.create({ data: { ...dto, businessId } });
  }

  async updateStaff(businessId: string, staffId: string, ownerUserId: string, dto: UpdateStaffDto) {
    await this.assertOwnership(businessId, ownerUserId);
    return this.prisma.staff.update({ where: { id: staffId }, data: dto });
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
   * Computes open slots for a service/date by subtracting existing bookings
   * (and, for a specific staff member, their weekly availability + one-off
   * overrides) from the business's working hours. "Any staff" mode checks
   * aggregate capacity across all active staff instead of one calendar.
   */
  async availability(businessId: string, query: AvailabilityQueryDto) {
    const service = await this.prisma.service.findUnique({ where: { id: query.serviceId } });
    if (!service || service.businessId !== businessId) {
      throw new NotFoundException('Service not found for this business');
    }

    const staffList = query.staffId
      ? await this.prisma.staff.findMany({ where: { id: query.staffId, businessId, active: true } })
      : await this.prisma.staff.findMany({ where: { businessId, active: true } });

    if (query.staffId && staffList.length === 0) {
      throw new NotFoundException('Staff member not found for this business');
    }

    const dayStart = new Date(`${query.date}T00:00:00`);
    const dayEnd = new Date(`${query.date}T23:59:59`);
    const dayOfWeek = dayStart.getDay();

    const existingBookings = await this.prisma.booking.findMany({
      where: {
        businessId,
        slotStart: { gte: dayStart, lte: dayEnd },
        status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
        staffId: query.staffId ? query.staffId : { in: staffList.map((s) => s.id) },
      },
      select: { staffId: true, slotStart: true, slotEnd: true },
    });

    const slots: { staffId: string; start: string; end: string }[] = [];
    for (const staff of staffList) {
      const weekly = await this.prisma.staffAvailability.findMany({
        where: { staffId: staff.id, dayOfWeek },
      });
      const override = await this.prisma.staffAvailabilityOverride.findFirst({
        where: { staffId: staff.id, specificDate: dayStart },
      });
      if (override?.isClosed) continue;

      const windows = override?.startTime && override.endTime
        ? [{ startTime: override.startTime, endTime: override.endTime }]
        : weekly;

      for (const window of windows) {
        const [startH, startM] = window.startTime.split(':').map(Number);
        const [endH, endM] = window.endTime.split(':').map(Number);
        let cursor = new Date(dayStart);
        cursor.setHours(startH, startM, 0, 0);
        const windowEnd = new Date(dayStart);
        windowEnd.setHours(endH, endM, 0, 0);

        while (cursor.getTime() + service.durationMinutes * 60_000 <= windowEnd.getTime()) {
          const slotStart = new Date(cursor);
          const slotEnd = new Date(cursor.getTime() + service.durationMinutes * 60_000);
          const overlaps = existingBookings.some(
            (b) =>
              b.staffId === staff.id &&
              slotStart < b.slotEnd &&
              slotEnd > b.slotStart,
          );
          if (!overlaps && slotStart > new Date()) {
            slots.push({ staffId: staff.id, start: slotStart.toISOString(), end: slotEnd.toISOString() });
          }
          cursor = new Date(cursor.getTime() + service.durationMinutes * 60_000);
        }
      }
    }

    return { date: query.date, serviceId: query.serviceId, slots };
  }

  async ownerDashboard(ownerUserId: string, businessId: string) {
    await this.assertOwnership(businessId, ownerUserId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [todaysBookings, cancellationsToday, revenueAgg] = await Promise.all([
      this.prisma.booking.findMany({
        where: { businessId, slotStart: { gte: todayStart, lte: todayEnd } },
        include: { service: true, customer: { select: { name: true, phone: true } }, staff: true },
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
    ]);

    return {
      todaysBookings,
      cancellationsToday,
      revenueToday: revenueAgg._sum.amount ?? 0,
    };
  }
}
