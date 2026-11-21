import { Body, Controller, Get, Patch } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { imageUrlSchema } from '../../common/validation/image-url.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().email().optional(),
  // null removes the profile picture.
  avatarUrl: imageUrlSchema.nullable().optional(),
});
type UpdateMeDto = z.infer<typeof updateMeSchema>;

@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.user.findUnique({
      where: { id: user.id },
      include: { customerProfile: true },
    });
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(updateMeSchema)) body: UpdateMeDto) {
    // Role is deliberately not editable here (FR-1.2 AC).
    return this.prisma.user.update({
      where: { id: user.id },
      data: { name: body.name, email: body.email, avatarUrl: body.avatarUrl },
      include: { customerProfile: true },
    });
  }
}
