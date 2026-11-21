import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';
import { BookingsService } from './bookings.service.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.js';
import {
  addServicesSchema,
  cancelBookingSchema,
  completeBookingSchema,
  createBookingSchema,
  markNoShowSchema,
  rescheduleBookingSchema,
  type AddServicesDto,
  type CancelBookingDto,
  type CompleteBookingDto,
  type CreateBookingDto,
  type MarkNoShowDto,
  type RescheduleBookingDto,
} from './dto/create-booking.dto.js';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get('me')
  @Roles('CUSTOMER')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.bookings.findForCustomer(user.id);
  }

  @Post()
  @Roles('CUSTOMER')
  @RateLimit({ name: 'booking-create', limit: 10, windowSeconds: 3600, by: 'user' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createBookingSchema)) dto: CreateBookingDto,
  ) {
    return this.bookings.create(user.id, dto);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelBookingSchema)) dto: CancelBookingDto,
  ) {
    return this.bookings.cancel(id, user, dto);
  }

  @Post(':id/reschedule')
  @Roles('CUSTOMER')
  @RateLimit({ name: 'booking-reschedule', limit: 10, windowSeconds: 3600, by: 'user' })
  reschedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rescheduleBookingSchema)) dto: RescheduleBookingDto,
  ) {
    return this.bookings.reschedule(id, user, dto);
  }

  @Post(':id/complete')
  @Roles('OWNER', 'STAFF')
  // Guessing the 6-digit code: 10 tries per 10 minutes per account.
  @RateLimit({ name: 'booking-complete', limit: 10, windowSeconds: 600, by: 'user' })
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(completeBookingSchema)) dto: CompleteBookingDto,
  ) {
    return this.bookings.complete(id, user, dto);
  }

  @Post(':id/start')
  @Roles('OWNER')
  start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookings.start(id, user);
  }

  @Post(':id/add-services')
  @Roles('CUSTOMER')
  @RateLimit({ name: 'booking-addons', limit: 20, windowSeconds: 3600, by: 'user' })
  addServices(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addServicesSchema)) dto: AddServicesDto,
  ) {
    return this.bookings.addServices(id, user, dto);
  }

  @Post(':id/call')
  @Roles('CUSTOMER', 'OWNER')
  call(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookings.call(id, user);
  }

  @Patch(':id/no-show')
  @Roles('OWNER')
  markNoShow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(markNoShowSchema)) dto: MarkNoShowDto,
  ) {
    return this.bookings.markNoShow(id, user, dto);
  }
}
