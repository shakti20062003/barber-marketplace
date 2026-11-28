import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';
import { AddressesService } from './addresses.service.js';
import { createAddressSchema, type CreateAddressDto } from './dto/address.dto.js';

@Controller('addresses')
@Roles('CUSTOMER')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.addresses.list(user.id);
  }

  @Post()
  @RateLimit({ name: 'address-create', limit: 20, windowSeconds: 3600, by: 'user' })
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createAddressSchema)) dto: CreateAddressDto) {
    return this.addresses.create(user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.addresses.remove(user.id, id);
  }
}
