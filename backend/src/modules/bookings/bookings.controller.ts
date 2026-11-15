import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';
import { BookingsService } from './bookings.service.js';
import {
  cancelBookingSchema,
  completeBookingSchema,
  createBookingSchema,
  markNoShowSchema,
  rescheduleBookingSchema,
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
  reschedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rescheduleBookingSchema)) dto: RescheduleBookingDto,
  ) {
    return this.bookings.reschedule(id, user, dto);
  }

  @Post(':id/complete')
  @Roles('OWNER', 'STAFF')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(completeBookingSchema)) dto: CompleteBookingDto,
  ) {
    return this.bookings.complete(id, user, dto);
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
