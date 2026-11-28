import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';
import { BusinessesService } from './businesses.service.js';
import { BookingsService } from '../bookings/bookings.service.js';
import {
  createBusinessSchema,
  updateBusinessSchema,
  type CreateBusinessDto,
  type UpdateBusinessDto,
} from './dto/create-business.dto.js';
import { createServiceSchema, updateServiceSchema, type CreateServiceDto, type UpdateServiceDto } from './dto/service.dto.js';
import { createStaffSchema, updateStaffSchema, type CreateStaffDto, type UpdateStaffDto } from './dto/staff.dto.js';
import { createMediaSchema, type CreateMediaDto } from './dto/media.dto.js';

@Controller('owner')
@Roles('OWNER')
export class OwnerBusinessesController {
  constructor(
    private readonly businesses: BusinessesService,
    private readonly bookings: BookingsService,
  ) {}

  @Get('businesses')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.businesses.findByOwner(user.id);
  }

  @RateLimit({ name: 'owner-create-business', limit: 5, windowSeconds: 86400, by: 'user' })
  @Post('businesses')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createBusinessSchema)) dto: CreateBusinessDto,
  ) {
    return this.businesses.create(user.id, dto);
  }

  @Patch('businesses/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBusinessSchema)) dto: UpdateBusinessDto,
  ) {
    return this.businesses.update(id, user.id, dto);
  }

  @Post('businesses/:id/services')
  addService(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createServiceSchema)) dto: CreateServiceDto,
  ) {
    return this.businesses.addService(id, user.id, dto);
  }

  @Patch('businesses/:id/services/:serviceId')
  updateService(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('serviceId') serviceId: string,
    @Body(new ZodValidationPipe(updateServiceSchema)) dto: UpdateServiceDto,
  ) {
    return this.businesses.updateService(id, serviceId, user.id, dto);
  }

  @Post('businesses/:id/staff')
  addStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createStaffSchema)) dto: CreateStaffDto,
  ) {
    return this.businesses.addStaff(id, user.id, dto);
  }

  @Patch('businesses/:id/staff/:staffId')
  updateStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('staffId') staffId: string,
    @Body(new ZodValidationPipe(updateStaffSchema)) dto: UpdateStaffDto,
  ) {
    return this.businesses.updateStaff(id, staffId, user.id, dto);
  }

  @Get('businesses/:id/dashboard')
  dashboard(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.businesses.ownerDashboard(user.id, id);
  }

  /** Full booking history (every status, all time), paginated — distinct from the live `dashboard` view above. */
  @Get('businesses/:id/bookings')
  bookingHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.bookings.findForOwner(id, user.id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('businesses/:id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.businesses.findForOwner(id, user.id);
  }

  @RateLimit({ name: 'owner-media', limit: 40, windowSeconds: 3600, by: 'user' })
  @Post('businesses/:id/media')
  addMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createMediaSchema)) dto: CreateMediaDto,
  ) {
    return this.businesses.addMedia(id, user.id, dto);
  }

  @Delete('businesses/:id/media/:mediaId')
  removeMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
  ) {
    return this.businesses.removeMedia(id, mediaId, user.id);
  }
}
