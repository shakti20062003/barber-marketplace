import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';
import { ReviewsService } from './reviews.service.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.js';
import { createReviewSchema, type CreateReviewDto } from './dto/create-review.dto.js';

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('reviews')
  @Roles('CUSTOMER')
  @RateLimit({ name: 'review-create', limit: 10, windowSeconds: 3600, by: 'user' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createReviewSchema)) dto: CreateReviewDto,
  ) {
    return this.reviews.create(user.id, dto);
  }

  @Public()
  @Get('businesses/:id/reviews')
  findForBusiness(@Param('id') id: string) {
    return this.reviews.findForBusiness(id);
  }
}
