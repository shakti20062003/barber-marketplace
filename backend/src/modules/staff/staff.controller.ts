import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';
import { StaffService } from './staff.service.js';
import { updateStaffSelfSchema, setEngagedSchema, type UpdateStaffSelfDto, type SetEngagedDto } from './dto/staff-self.dto.js';
import { addPortfolioMediaSchema, type AddPortfolioMediaDto } from './dto/portfolio.dto.js';

@Controller('staff')
@Roles('STAFF')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.staff.me(user.id);
  }

  @Patch('me')
  @RateLimit({ name: 'staff-update-me', limit: 30, windowSeconds: 3600, by: 'user' })
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(updateStaffSelfSchema)) dto: UpdateStaffSelfDto) {
    return this.staff.updateMe(user.id, dto);
  }

  @Post('me/engaged')
  @RateLimit({ name: 'staff-set-engaged', limit: 60, windowSeconds: 3600, by: 'user' })
  setEngaged(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(setEngagedSchema)) dto: SetEngagedDto) {
    return this.staff.setEngaged(user.id, dto);
  }

  @Post('me/portfolio')
  @RateLimit({ name: 'staff-add-portfolio', limit: 40, windowSeconds: 3600, by: 'user' })
  addPortfolioMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(addPortfolioMediaSchema)) dto: AddPortfolioMediaDto,
  ) {
    return this.staff.addPortfolioMedia(user.id, dto);
  }

  @Delete('me/portfolio/:mediaId')
  removePortfolioMedia(@CurrentUser() user: AuthenticatedUser, @Param('mediaId') mediaId: string) {
    return this.staff.removePortfolioMedia(user.id, mediaId);
  }

  @Get('me/bookings')
  myBookings(@CurrentUser() user: AuthenticatedUser) {
    return this.staff.myBookings(user.id);
  }
}
