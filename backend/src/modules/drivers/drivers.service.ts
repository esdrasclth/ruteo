import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DriverStatus, Prisma } from '@prisma/client';
import { TOPE_CATALOGO } from '../../common/dto/paginacion.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateDriverDto) {
    try {
      return await this.prisma.withTenant(tenantId, (tx) =>
        tx.driver.create({
          data: {
            tenantId,
            name: dto.name,
            phone: dto.phone,
            vehicleType: dto.vehicleType,
            vehiclePlate: dto.vehiclePlate,
            zoneId: dto.zoneId,
            userId: dto.userId,
          },
        }),
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  list(tenantId: string, status?: DriverStatus) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.driver.findMany({
        where: status ? { status } : undefined,
        orderBy: { name: 'asc' },
        take: TOPE_CATALOGO,
      }),
    );
  }

  async findOne(tenantId: string, id: string) {
    const driver = await this.prisma.withTenant(tenantId, (tx) =>
      tx.driver.findUnique({ where: { id } }),
    );
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    return driver;
  }

  async update(tenantId: string, id: string, dto: UpdateDriverDto) {
    await this.findOne(tenantId, id);
    try {
      return await this.prisma.withTenant(tenantId, (tx) =>
        tx.driver.update({
          where: { id },
          data: {
            name: dto.name,
            phone: dto.phone,
            vehicleType: dto.vehicleType,
            vehiclePlate: dto.vehiclePlate,
            zoneId: dto.zoneId,
            userId: dto.userId,
            status: dto.status,
          },
        }),
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.driver.delete({ where: { id } }),
    );
    return { deleted: true };
  }

  private mapError(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new BadRequestException(
        'That user is already linked to another driver',
      );
    }
    return error;
  }
}
