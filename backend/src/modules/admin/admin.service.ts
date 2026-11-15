import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateCategoryDto, CreateCityDto, VerifyBusinessDto } from './dto/verify-business.dto.js';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  pendingBusinesses() {
    return this.prisma.business.findMany({
      where: { verificationStatus: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        owner: { select: { name: true, phone: true, email: true } },
        city: { select: { name: true } },
        media: true,
        services: true,
        staff: true,
      },
    });
  }

  verifiedBusinesses() {
    return this.prisma.business.findMany({
      where: { verificationStatus: 'VERIFIED' },
      orderBy: { name: 'asc' },
      include: { owner: { select: { name: true, phone: true } }, city: { select: { name: true } } },
    });
  }

  async stats() {
    const [pendingCount, verifiedCount, rejectedCount, customerCount, ownerCount, bookingCount] =
      await Promise.all([
        this.prisma.business.count({ where: { verificationStatus: 'PENDING' } }),
        this.prisma.business.count({ where: { verificationStatus: 'VERIFIED' } }),
        this.prisma.business.count({ where: { verificationStatus: 'REJECTED' } }),
        this.prisma.user.count({ where: { role: 'CUSTOMER' } }),
        this.prisma.user.count({ where: { role: 'OWNER' } }),
        this.prisma.booking.count(),
      ]);
    return { pendingCount, verifiedCount, rejectedCount, customerCount, ownerCount, bookingCount };
  }

  async verifyBusiness(adminUserId: string, businessId: string, dto: VerifyBusinessDto) {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found');

    const [updated] = await this.prisma.$transaction([
      this.prisma.business.update({
        where: { id: businessId },
        data: { verificationStatus: dto.decision },
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: `BUSINESS_${dto.decision}`,
          entityType: 'Business',
          entityId: businessId,
          metadata: { reason: dto.reason },
        },
      }),
      ...(dto.decision === 'VERIFIED'
        ? [
            this.prisma.businessTrustBadge.create({
              data: { businessId, badgeType: 'VERIFIED', source: 'ADMIN' },
            }),
          ]
        : []),
    ]);

    return updated;
  }

  createCity(dto: CreateCityDto) {
    return this.prisma.city.create({ data: dto });
  }

  listCities() {
    return this.prisma.city.findMany({ orderBy: { name: 'asc' } });
  }

  createCategory(dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: dto });
  }

  listCategories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  flaggedReviews() {
    // TODO: reviews need a `flagged` field once the moderation flow is
    // built out — for now this just surfaces the newest reviews so support
    // staff have somewhere to look (§FR-7.3, lightweight MVP version).
    return this.prisma.review.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { business: { select: { name: true } }, customer: { select: { name: true } } },
    });
  }
}
