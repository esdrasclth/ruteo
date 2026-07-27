import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateZoneDto) {
    try {
      return await this.prisma.withTenant(tenantId, (tx) =>
        tx.zone.create({
          data: {
            tenantId,
            name: dto.name,
            code: dto.code,
            description: dto.description,
            centerLat: dto.centerLat,
            centerLng: dto.centerLng,
            radiusKm: dto.radiusKm,
          },
        }),
      );
    } catch (error) {
      throw this.mapError(error, dto.code);
    }
  }

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.zone.findMany({ orderBy: { name: 'asc' } }),
    );
  }

  async findOne(tenantId: string, id: string) {
    const zone = await this.prisma.withTenant(tenantId, (tx) =>
      tx.zone.findUnique({ where: { id } }),
    );
    if (!zone) {
      throw new NotFoundException('Zone not found');
    }
    return zone;
  }

  async update(tenantId: string, id: string, dto: UpdateZoneDto) {
    await this.findOne(tenantId, id);
    try {
      return await this.prisma.withTenant(tenantId, (tx) =>
        tx.zone.update({
          where: { id },
          data: {
            name: dto.name,
            code: dto.code,
            description: dto.description,
            centerLat: dto.centerLat,
            centerLng: dto.centerLng,
            radiusKm: dto.radiusKm,
            active: dto.active,
          },
        }),
      );
    } catch (error) {
      throw this.mapError(error, dto.code);
    }
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.zone.delete({ where: { id } }),
    );
    return { deleted: true };
  }

  private mapError(error: unknown, code?: string) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new BadRequestException(`Zone code "${code}" already exists`);
    }
    return error;
  }
}
