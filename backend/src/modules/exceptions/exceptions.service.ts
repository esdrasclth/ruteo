import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ExceptionStatus, Prisma } from '@prisma/client';
import { saltar } from '../../common/dto/paginacion.dto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateExceptionDto,
  UpdateExceptionDto,
} from './dto/create-exception.dto';
import { QueryExceptionsDto } from './dto/query-exceptions.dto';

/**
 * Excepciones: lo que salió mal y hay que resolver.
 *
 * Que sean entidad y no estado es lo que permite que un envío esté a la vez «en
 * aduana» y «con documentación pendiente». Con el problema metido en
 * `ShipmentStatus` habría que elegir cuál de las dos contar, y la operación real
 * necesita las dos.
 */
@Injectable()
export class ExceptionsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly detalle = {
    shipment: { select: { id: true, trackingNumber: true, status: true } },
    manifest: { select: { id: true, number: true } },
  } satisfies Prisma.ExceptionInclude;

  create(tenantId: string, dto: CreateExceptionDto, userId?: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.exception.create({
        data: { tenantId, ...dto, createdByUserId: userId },
        include: this.detalle,
      }),
    );
  }

  // Paginado desde el principio: una operación con problemas genera excepciones
  // todos los días y la lista solo crece. Sin paginar, la pantalla que más se
  // mira sería la que primero se vuelve lenta.
  async list(tenantId: string, query: QueryExceptionsDto) {
    const where: Prisma.ExceptionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.shipmentId ? { shipmentId: query.shipmentId } : {}),
      ...(query.manifestId ? { manifestId: query.manifestId } : {}),
    };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [total, items] = await Promise.all([
        tx.exception.count({ where }),
        tx.exception.findMany({
          where,
          // Las abiertas primero y las graves antes: es una bandeja de trabajo,
          // no un histórico. Ordenar solo por fecha dejaría un faltante grave de
          // ayer debajo de una diferencia de peso de hoy.
          orderBy: [{ status: 'asc' }, { severity: 'desc' }, { createdAt: 'desc' }],
          skip: saltar(query),
          take: query.pageSize,
          include: this.detalle,
        }),
      ]);
      return { items, total, page: query.page, pageSize: query.pageSize };
    });
  }

  /** Cuántas hay sin cerrar, por severidad. Alimenta el tablero. */
  async resumen(tenantId: string) {
    const filas = await this.prisma.withTenant(tenantId, (tx) =>
      tx.exception.groupBy({
        by: ['severity'],
        where: {
          status: { in: [ExceptionStatus.OPEN, ExceptionStatus.INVESTIGATING] },
        },
        _count: { _all: true },
      }),
    );
    return {
      abiertas: filas.reduce((n, f) => n + f._count._all, 0),
      porSeveridad: Object.fromEntries(
        filas.map((f) => [f.severity, f._count._all]),
      ),
    };
  }

  async findOne(tenantId: string, id: string) {
    const fila = await this.prisma.withTenant(tenantId, (tx) =>
      tx.exception.findUnique({ where: { id }, include: this.detalle }),
    );
    if (!fila) throw new NotFoundException('La excepción no existe');
    return fila;
  }

  async update(tenantId: string, id: string, dto: UpdateExceptionDto) {
    const actual = await this.findOne(tenantId, id);

    const cierra =
      dto.status === ExceptionStatus.RESOLVED ||
      dto.status === ExceptionStatus.WRITTEN_OFF;

    // Cerrar exige decir qué se hizo. Sin esto, «resuelta» no distingue entre
    // se arregló y alguien se cansó de verla en la lista, y el histórico deja de
    // servir para entender qué pasa en la operación.
    if (cierra && !dto.resolution && !actual.resolution) {
      throw new BadRequestException(
        'Para cerrar una excepción hay que explicar cómo se resolvió.',
      );
    }

    return this.prisma.withTenant(tenantId, (tx) =>
      tx.exception.update({
        where: { id },
        data: {
          ...dto,
          // La fecha de cierre la pone el sistema, no quien llama: es un dato
          // de auditoría y no debe poder escribirse a mano.
          resolvedAt: cierra ? (actual.resolvedAt ?? new Date()) : null,
        },
        include: this.detalle,
      }),
    );
  }
}
