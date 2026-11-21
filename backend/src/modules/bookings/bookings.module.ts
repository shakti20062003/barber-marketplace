import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { CallBridgeService } from './call-bridge.service.js';

@Module({
  controllers: [BookingsController],
  providers: [BookingsService, CallBridgeService],
  exports: [BookingsService],
})
export class BookingsModule {}
