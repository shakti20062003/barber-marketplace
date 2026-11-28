import { Module } from '@nestjs/common';
import { BusinessesController } from './businesses.controller.js';
import { OwnerBusinessesController } from './owner-businesses.controller.js';
import { BusinessesService } from './businesses.service.js';
import { BookingsModule } from '../bookings/bookings.module.js';

@Module({
  imports: [BookingsModule],
  controllers: [BusinessesController, OwnerBusinessesController],
  providers: [BusinessesService],
  exports: [BusinessesService],
})
export class BusinessesModule {}
