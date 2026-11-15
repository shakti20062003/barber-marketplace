import { Module } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';

// Public, read-only reference data (cities, categories) used to populate
// search filters and onboarding forms on the frontend. Writes live in
// AdminModule since only admins manage this data (FR-7.2).
@Controller()
class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('cities')
  cities() {
    return this.prisma.city.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  @Public()
  @Get('categories')
  categories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }
}

@Module({ controllers: [CatalogController] })
export class CatalogModule {}
