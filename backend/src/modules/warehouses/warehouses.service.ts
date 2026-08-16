import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TripStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  Pagina,
  PaginacionDto,
  saltar,
  TOPE_CATALOGO,
} from '../../common/dto/paginacion.dto';
import {
  CreateTripDto,
  CreateWarehouseDto,
  UpdateTripStatusDto,
  UpdateWarehouseDto,
} from './dto/warehouse.dto';

/** Lo que devuelve el listado de viajes: el viaje con su contexto. */
type Viaje = Prisma.TripGetPayload<{
  include: {
    carrier: { select: { id: true; name: true } };
    origin: { select: { id: true; code: true } };
    destination: { select: { id: true; code: true } };
    _count: { select: { manifests: true } };
  };
}>;

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
      // Las bodegas SÍ son catálogo —crecen con el tamaño de la empresa, no
      // con la operación— y alimentan desplegables, así que no se paginan.
      // Pero tampoco pueden ir sin techo, que es como estaban: `TOPE_CATALOGO`
      // es el punto donde se deja de servir. Ver `paginacion.dto.ts`.
      tx.warehouse.findMany({
        orderBy: [{ type: 'asc' }, { code: 'asc' }],
        take: TOPE_CATALOGO,
      }),
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

  /**
   * Los viajes, paginados.
   *
   * A diferencia de las bodegas, un viaje es un hecho de la operación: se
   * acumulan uno por vuelo y no paran de crecer. Con el `take: 100` que había,
   * una empresa con un año de vuelos veía los cien últimos y ninguna pantalla
   * decía que hubiera más.
   */
  async listTrips(
    tenantId: string,
    filters: PaginacionDto,
  ): Promise<Pagina<Viaje>> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.trip.findMany({
          orderBy: { departureAt: 'desc' },
          skip: saltar(filters),
          take: filters.pageSize,
          include: {
            carrier: { select: { id: true, name: true } },
            origin: { select: { id: true, code: true } },
            destination: { select: { id: true, code: true } },
            _count: { select: { manifests: true } },
          },
        }),
        tx.trip.count(),
      ]);

      return { items, total, page: filters.page, pageSize: filters.pageSize };
    });
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
