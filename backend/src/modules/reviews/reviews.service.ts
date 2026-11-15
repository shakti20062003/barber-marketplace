import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateReviewDto } from './dto/create-review.dto.js';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(customerId: string, dto: CreateReviewDto) {
    const booking = await this.prisma.booking.findUnique({ where: { id: dto.bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.customerId !== customerId) throw new ForbiddenException('Not your booking');
    // §4.4 / FR-5.1 AC: only COMPLETED bookings can be reviewed, one per
    // booking — the unique FK on reviews.bookingId enforces this at the
    // data-model level too, this check just gives a clean error message.
    if (booking.status !== 'COMPLETED') {
      throw new BadRequestException('Only completed bookings can be reviewed');
    }
    const existing = await this.prisma.review.findUnique({ where: { bookingId: dto.bookingId } });
    if (existing) throw new BadRequestException('This booking has already been reviewed');

    return this.prisma.review.create({
      data: {
        bookingId: dto.bookingId,
        customerId,
        businessId: booking.businessId,
        staffId: booking.staffId,
        rating: dto.rating,
        staffRating: dto.staffRating,
        text: dto.text,
        media: { create: dto.mediaUrls.map((url) => ({ url, type: 'IMAGE' as const })) },
      },
      include: { media: true },
    });
  }

  async findForBusiness(businessId: string) {
    return this.prisma.review.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      include: { media: true, customer: { select: { name: true } } },
    });
  }
}
