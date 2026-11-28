import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateAddressDto } from './dto/address.dto.js';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.address.findMany({ where: { userId }, orderBy: { label: 'asc' } });
  }

  create(userId: string, dto: CreateAddressDto) {
    return this.prisma.address.create({ data: { ...dto, userId } });
  }

  async remove(userId: string, addressId: string) {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address || address.userId !== userId) throw new NotFoundException('Address not found');
    try {
      await this.prisma.address.delete({ where: { id: addressId } });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2003') {
        throw new ConflictException('This address is used by a booking and cannot be deleted.');
      }
      throw err;
    }
    return { deleted: true };
  }
}
