import { Body, ConflictException, Controller, Get, Patch } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { imageUrlSchema } from '../../common/validation/image-url.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

/** "98765 43210" / "098765-43210" / "+91 98765 43210" → "+919876543210". */
function normalizeIndianPhone(raw: string): string | null {
  const digits = raw.replace(/[\s()-]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  const local = digits.replace(/^0/, '');
  if (/^[6-9]\d{9}$/.test(local)) return `+91${local}`;
  return null;
}

const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().email().optional(),
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
    if (body.email !== undefined && body.email !== current.email) {
      const taken = await this.prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
      if (taken && taken.id !== user.id) throw new ConflictException('This email is already used by another Trimly account.');
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          name: body.name,
          email: body.email?.toLowerCase(),
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
