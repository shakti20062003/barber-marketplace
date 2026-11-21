import { Body, Controller, Get, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { imageUrlSchema } from '../../common/validation/image-url.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Style Finder catalogue (men's + women's cuts). Face analysis happens
 * entirely in the customer's browser — this API only serves the catalogue
 * and lets admins maintain it (photos, wording, face-shape scores).
 */

const score = z.number().int().min(0).max(100);
const faceShapeFitSchema = z.object({
  oval: score,
  round: score,
  square: score,
  heart: score,
  oblong: score,
  diamond: score,
});

const createStyleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  gender: z.enum(['MEN', 'WOMEN']),
  description: z.string().trim().min(5).max(400),
  length: z.enum(['Short', 'Medium', 'Long']),
  maintenance: z.enum(['Low', 'Medium', 'High']),
  faceShapeFit: faceShapeFitSchema,
  imageUrl: imageUrlSchema.nullable().optional(),
});
type CreateStyleDto = z.infer<typeof createStyleSchema>;

const updateStyleSchema = createStyleSchema.partial().extend({
  active: z.boolean().optional(),
  order: z.number().int().optional(),
});
type UpdateStyleDto = z.infer<typeof updateStyleSchema>;

const listQuerySchema = z.object({ gender: z.enum(['MEN', 'WOMEN']).optional() });
type ListQuery = z.infer<typeof listQuerySchema>;

@Controller()
export class StylesController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('styles')
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.prisma.hairStyle.findMany({
      where: { active: true, gender: query.gender },
      orderBy: [{ gender: 'asc' }, { order: 'asc' }, { name: 'asc' }],
    });
  }

  @Roles('ADMIN')
  @Get('admin/styles')
  listAll() {
    return this.prisma.hairStyle.findMany({ orderBy: [{ gender: 'asc' }, { order: 'asc' }, { name: 'asc' }] });
  }

  @Roles('ADMIN')
  @Post('admin/styles')
  async create(@Body(new ZodValidationPipe(createStyleSchema)) dto: CreateStyleDto) {
    const count = await this.prisma.hairStyle.count({ where: { gender: dto.gender } });
    return this.prisma.hairStyle.create({ data: { ...dto, order: count } });
  }

  @Roles('ADMIN')
  @Patch('admin/styles/:id')
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(updateStyleSchema)) dto: UpdateStyleDto) {
    const existing = await this.prisma.hairStyle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Style not found');
    return this.prisma.hairStyle.update({ where: { id }, data: dto });
  }
}

@Module({ controllers: [StylesController] })
export class StylesModule {}
