import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { BusinessesService } from './businesses.service.js';
import { searchBusinessesSchema, type SearchBusinessesDto } from './dto/search-businesses.dto.js';
import { availabilityQuerySchema, type AvailabilityQueryDto } from './dto/availability-query.dto.js';

@Controller()
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}

  @Public()
  @Get('search/businesses')
  search(@Query(new ZodValidationPipe(searchBusinessesSchema)) query: SearchBusinessesDto) {
    return this.businesses.search(query);
  }

  @Public()
  @Get('businesses/:id')
  findOne(@Param('id') id: string) {
    return this.businesses.findById(id);
  }

  @Public()
  @Get('businesses/:id/availability')
  availability(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(availabilityQuerySchema)) query: AvailabilityQueryDto,
  ) {
    return this.businesses.availability(id, query);
  }

  @Public()
  @Get('staff/:id')
  findStaff(@Param('id') id: string) {
    return this.businesses.findStaffById(id);
  }
}
