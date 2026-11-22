import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnv } from './config/env.schema.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './common/redis/redis.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { BusinessesModule } from './modules/businesses/businesses.module.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { ReviewsModule } from './modules/reviews/reviews.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { StylesModule } from './modules/styles/styles.module.js';
import { PushModule } from './common/push/push.module.js';
import { CallsModule } from './modules/calls/calls.module.js';
import { RateLimitGuard } from './common/rate-limit/rate-limit.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    BusinessesModule,
    BookingsModule,
    ReviewsModule,
    AdminModule,
    CatalogModule,
    PaymentsModule,
    StylesModule,
    PushModule,
    CallsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Every endpoint requires a valid JWT by default; opt out explicitly
    // with @Public() (search, profiles, auth, webhooks).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // After auth so per-user limits can key on the signed-in user.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
