import { Body, ConflictException, Controller, Get, Patch } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { imageUrlSchema } from '../../common/validation/image-url.js';
import { normalizeIndianPhone } from '../../common/validation/phone.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.js';

const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  // No `email` here on purpose: email is only ever set from a verified Google
  // sign-in. If users could type one in, an attacker could pre-claim a
  // victim's email and the victim's later Google sign-in would be linked
  // into the attacker's account.
  // null removes the profile picture.
  avatarUrl: imageUrlSchema.nullable().optional(),
  phone: z
    .string()
    .transform((v, ctx) => {
      const n = normalizeIndianPhone(v);
      if (!n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid 10-digit mobile number' });
      return n ?? '';
    })
    .optional(),
});
type UpdateMeDto = z.infer<typeof updateMeSchema>;

/** Never send internal ids (googleSub) to the browser — just whether Google is linked. */
function publicUser<T extends { googleSub: string | null }>(u: T) {
  const { googleSub, ...rest } = u;
  return { ...rest, googleLinked: !!googleSub };
}

@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const me = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { customerProfile: true },
    });
    return publicUser(me);
  }

  @Patch('me')
  @RateLimit({ name: 'profile-update', limit: 30, windowSeconds: 3600, by: 'user' })
  async updateMe(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(updateMeSchema)) body: UpdateMeDto) {
    // Role is deliberately not editable here (FR-1.2 AC).
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    // One phone number = one account.
    let phoneData: { phone?: string; phoneVerified?: boolean } = {};
    if (body.phone !== undefined && body.phone !== current.phone) {
      const taken = await this.prisma.user.findUnique({ where: { phone: body.phone } });
      if (taken && taken.id !== user.id) {
        throw new ConflictException('This mobile number is already registered with another Trimly account.');
      }
      // Can't verify by SMS yet, so a newly entered number is unverified.
      phoneData = { phone: body.phone, phoneVerified: false };
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          name: body.name,
          avatarUrl: body.avatarUrl,
          ...phoneData,
        },
        include: { customerProfile: true },
      });
      return publicUser(updated);
    } catch (err) {
      // Unique constraint race (two accounts saving the same number at once).
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('This mobile number or email is already registered with another Trimly account.');
      }
      throw err;
    }
  }
}
