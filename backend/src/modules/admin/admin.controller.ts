import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';
import { AdminService } from './admin.service.js';
import {
  createCategorySchema,
  createCitySchema,
  verifyBusinessSchema,
  type CreateCategoryDto,
  type CreateCityDto,
  type VerifyBusinessDto,
} from './dto/verify-business.dto.js';

@Controller('admin')
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('businesses')
  businesses(@Query('status') status: string) {
    if (status !== 'PENDING' && status !== 'VERIFIED' && status !== 'REJECTED') {
      throw new BadRequestException('status must be PENDING, VERIFIED or REJECTED');
    }
    return this.admin.businessesByStatus(status);
  }

  @Get('users')
  users(@Query('role') role: string) {
    if (role !== 'CUSTOMER' && role !== 'OWNER') throw new BadRequestException('role must be CUSTOMER or OWNER');
    return this.admin.users(role);
  }

  @Get('bookings')
  bookings() {
    return this.admin.recentBookings();
  }

  @Get('businesses/pending')
  pending() {
    return this.admin.pendingBusinesses();
  }

  @Get('businesses/verified')
  verified() {
    return this.admin.verifiedBusinesses();
  }

  @Post('businesses/:id/verify')
  verify(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(verifyBusinessSchema)) dto: VerifyBusinessDto,
  ) {
    return this.admin.verifyBusiness(user.id, id, dto);
  }

  @Post('cities')
  createCity(@Body(new ZodValidationPipe(createCitySchema)) dto: CreateCityDto) {
    return this.admin.createCity(dto);
  }

  @Post('categories')
  createCategory(@Body(new ZodValidationPipe(createCategorySchema)) dto: CreateCategoryDto) {
    return this.admin.createCategory(dto);
  }

  @Get('reviews/flagged')
  flaggedReviews() {
    return this.admin.flaggedReviews();
  }
}
