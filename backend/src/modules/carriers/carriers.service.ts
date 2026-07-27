import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCarrierDto } from './dto/create-carrier.dto';
import { UpdateCarrierDto } from './dto/update-carrier.dto';

@Injectable()
export class CarriersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateCarrierDto) {
    try {
      return await this.prisma.withTenant(tenantId, (tx) =>
        tx.carrier.create({
          data: {
            tenantId,
            name: dto.name,
            code: dto.code,
            type: dto.type,
            trackingUrlTemplate: dto.trackingUrlTemplate,
            active: dto.active,
          },
        }),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          `Carrier code "${dto.code}" already exists`,
        );
      }
      throw error;
    }
  }

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.carrier.findMany({ orderBy: { name: 'asc' } }),
    );
  }

  async findOne(tenantId: string, id: string) {
    const carrier = await this.prisma.withTenant(tenantId, (tx) =>
      tx.carrier.findUnique({ where: { id } }),
    );
    if (!carrier) {
      throw new NotFoundException('Carrier not found');
    }
    return carrier;
  }

  async update(tenantId: string, id: string, dto: UpdateCarrierDto) {
    await this.findOne(tenantId, id);
    try {
      return await this.prisma.withTenant(tenantId, (tx) =>
        tx.carrier.update({
          where: { id },
          data: {
            name: dto.name,
            code: dto.code,
            type: dto.type,
            trackingUrlTemplate: dto.trackingUrlTemplate,
            active: dto.active,
          },
        }),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          `Carrier code "${dto.code}" already exists`,
        );
      }
      throw error;
    }
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.carrier.delete({ where: { id } }),
    );
    return { deleted: true };
  }
}
