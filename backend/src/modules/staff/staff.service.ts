import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UpdateStaffSelfDto, SetEngagedDto } from './dto/staff-self.dto.js';
import type { AddPortfolioMediaDto } from './dto/portfolio.dto.js';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every route here acts on the caller's own Staff row, resolved from their JWT, never a route param. */
  async myStaff(userId: string) {
    const staff = await this.prisma.staff.findUnique({ where: { userId } });
    if (!staff) throw new NotFoundException('No staff profile linked to this account');
    return staff;
  }

  async me(userId: string) {
    const staff = await this.myStaff(userId);
    return this.prisma.staff.findUnique({
      where: { id: staff.id },
      include: {
        business: { select: { id: true, name: true, verificationStatus: true } },
        certifications: true,
        portfolioMedia: true,
      },
    });
  }

  async updateMe(userId: string, dto: UpdateStaffSelfDto) {
    const staff = await this.myStaff(userId);
    return this.prisma.staff.update({ where: { id: staff.id }, data: dto });
  }

  async setEngaged(userId: string, dto: SetEngagedDto) {
    const staff = await this.myStaff(userId);
    const engagedUntil = dto.minutes > 0 ? new Date(Date.now() + dto.minutes * 60_000) : null;
    return this.prisma.staff.update({ where: { id: staff.id }, data: { engagedUntil } });
  }

  async addPortfolioMedia(userId: string, dto: AddPortfolioMediaDto) {
    const staff = await this.myStaff(userId);
    return this.prisma.staffPortfolioMedia.create({ data: { staffId: staff.id, url: dto.url, type: dto.type } });
  }

  async removePortfolioMedia(userId: string, mediaId: string) {
    const staff = await this.myStaff(userId);
    const media = await this.prisma.staffPortfolioMedia.findUnique({ where: { id: mediaId } });
    if (!media || media.staffId !== staff.id) throw new NotFoundException('Photo not found');
    await this.prisma.staffPortfolioMedia.delete({ where: { id: mediaId } });
    return { deleted: true };
  }

  async myBookings(userId: string) {
    const staff = await this.myStaff(userId);
    const bookings = await this.prisma.booking.findMany({
      where: { staffId: staff.id },
      orderBy: { slotStart: 'desc' },
      take: 100,
      include: {
        business: { select: { id: true, name: true } },
        customer: { select: { name: true } },
        service: { select: { name: true, durationMinutes: true } },
      },
    });
    return bookings.map((b) => ({
      id: b.id,
      slotStart: b.slotStart,
      slotEnd: b.slotEnd,
      status: b.status,
      serviceLocationType: b.serviceLocationType,
      business: b.business,
      customerName: b.customer.name,
      service: b.service,
    }));
  }
}
