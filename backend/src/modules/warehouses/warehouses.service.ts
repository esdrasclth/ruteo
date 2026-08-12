import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TripStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateTripDto,
  CreateWarehouseDto,
  UpdateTripStatusDto,
  UpdateWarehouseDto,
} from './dto/warehouse.dto';

/**
 * Bodegas y viajes.
 *
 * Antes «Miami» y «bodega HN» eran cadenas dentro de `originLabel`. Con filas
 * detrás se puede filtrar, contar y —lo que hacía falta para el cotejo— decir
 * contra qué bodega se está contando lo que llegó.
 *
 * Los viajes viven aquí y no en su propio módulo porque un viaje sin bodegas de
 * origen y destino no dice gran cosa, y separarlos habría creado dos módulos que
 * solo se usan juntos.
 */
@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  // Catálogo, no listado que crece con la operación: no se pagina. Una empresa
  // tiene bodegas, no miles de bodegas.
  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.warehouse.findMany({ orderBy: [{ type: 'asc' }, { code: 'asc' }] }),
    );
  }

  async create(tenantId: string, dto: CreateWarehouseDto) {
    try {
      return await this.prisma.withTenant(tenantId, (tx) =>
        tx.warehouse.create({ data: { tenantId, ...dto } }),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(`Ya existe una bodega ${dto.code}`);
      }
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateWarehouseDto) {
    await this.exigir(tenantId, id);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.warehouse.update({ where: { id }, data: dto }),
    );
  }

  // --- Viajes ---------------------------------------------------------------

  listTrips(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.trip.findMany({
        orderBy: { departureAt: 'desc' },
        take: 100,
        include: {
          carrier: { select: { id: true, name: true } },
          origin: { select: { id: true, code: true } },
          destination: { select: { id: true, code: true } },
          _count: { select: { manifests: true } },
        },
      }),
    );
  }

  createTrip(tenantId: string, dto: CreateTripDto) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.trip.create({
        data: {
          tenantId,
          carrierId: dto.carrierId,
          flightNumber: dto.flightNumber,
          originWarehouseId: dto.originWarehouseId,
          destinationWarehouseId: dto.destinationWarehouseId,
          departureAt: dto.departureAt ? new Date(dto.departureAt) : undefined,
          arrivalAt: dto.arrivalAt ? new Date(dto.arrivalAt) : undefined,
        },
      }),
    );
  }

  async updateTripStatus(
    tenantId: string,
    id: string,
    dto: UpdateTripStatusDto,
  ) {
    const viaje = await this.prisma.withTenant(tenantId, (tx) =>
      tx.trip.findUnique({ where: { id }, select: { id: true } }),
    );
    if (!viaje) throw new NotFoundException('El viaje no existe');

    return this.prisma.withTenant(tenantId, (tx) =>
      tx.trip.update({
        where: { id },
        data: {
          status: dto.status,
          // La llegada se sella al marcarla, no se teclea: es la fecha contra la
          // que se mide si la carga se descargó el mismo día que aterrizó.
          ...(dto.status === TripStatus.ARRIVED ? { arrivalAt: new Date() } : {}),
        },
      }),
    );
  }

  private async exigir(tenantId: string, id: string) {
    const fila = await this.prisma.withTenant(tenantId, (tx) =>
      tx.warehouse.findUnique({ where: { id }, select: { id: true } }),
    );
    if (!fila) throw new NotFoundException('La bodega no existe');
    return fila;
  }
}
