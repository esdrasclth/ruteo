import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ReturnDestination,
  ReturnStatus,
  ShipmentEventType,
  ShipmentStatus,
} from '@prisma/client';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { saltar } from '../../common/dto/paginacion.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { registrar } from '../shipments/eventos';
import { canTransition } from '../shipments/shipment-status';
import { ShipmentsService } from '../shipments/shipments.service';
import { CompleteReturnDto, CreateReturnDto } from './dto/create-return.dto';
import { QueryReturnsDto } from './dto/query-returns.dto';
import { describirDevolucion } from './motivo-devolucion';

/**
 * Devoluciones.
 *
 * Cuelgan del envío original en vez de crear uno inverso. Dos de los cuatro
 * destinos —abandonado y a sucursal— no son una entrega, así que un envío
 * nuevo quedaría sin destinatario ni reparto en la mitad de los casos; y el
 * cliente seguiría preguntando por el número que ya tenía.
 *
 * El envío NO pasa a `RETURNED` al decidir la devolución sino al completarla:
 * mientras está `PENDING` el bulto sigue físicamente donde estaba, y adelantar
 * el estado haría que el rastreo dijera «devuelto» de algo que aún está en la
 * bodega de reparto.
 */
@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shipments: ShipmentsService,
    private readonly audit: AuditService,
  ) {}

  private readonly detalle = {
    shipment: {
      select: {
        id: true,
        trackingNumber: true,
        status: true,
        type: true,
        recipientName: true,
      },
    },
    warehouse: { select: { id: true, name: true, code: true } },
  } satisfies Prisma.ReturnInclude;

  async create(tenantId: string, dto: CreateReturnDto, actor: AuthUser) {
    // La sucursal sólo tiene sentido con destino BRANCH, y con BRANCH es
    // obligatoria. Sin esta comprobación una devolución «a sucursal» sin
    // sucursal deja un bulto que nadie sabe a qué estante va. La base sostiene
    // la misma regla con un CHECK, por si alguien escribe por otro camino.
    if (dto.destination === ReturnDestination.BRANCH && !dto.warehouseId) {
      throw new BadRequestException(
        'Una devolución a sucursal tiene que decir a cuál.',
      );
    }
    if (dto.destination !== ReturnDestination.BRANCH && dto.warehouseId) {
      throw new BadRequestException(
        'Sólo una devolución a sucursal lleva sucursal.',
      );
    }

    const devolucion = await this.prisma.withTenant(tenantId, async (tx) => {
      const envio = await tx.shipment.findUnique({
        where: { id: dto.shipmentId },
        select: { id: true, status: true, trackingNumber: true },
      });
      if (!envio) throw new NotFoundException('El envío no existe');

      if (envio.status === ShipmentStatus.DELIVERED) {
        throw new BadRequestException(
          'Este envío ya se entregó: lo que corresponde es un reclamo, no una devolución.',
        );
      }

      const yaHay = await tx.return.findUnique({
        where: { shipmentId: dto.shipmentId },
        select: { id: true },
      });
      if (yaHay) {
        throw new BadRequestException('Este envío ya tiene una devolución.');
      }

      if (dto.warehouseId) {
        const sucursal = await tx.warehouse.findUnique({
          where: { id: dto.warehouseId },
          select: { id: true, allowsPickup: true },
        });
        if (!sucursal) throw new NotFoundException('La sucursal no existe');
        // Mismo criterio que el modo de entrega de la fase 5: una bodega de
        // tránsito no tiene mostrador, y mandar ahí un bulto a esperar al
        // cliente se descubre cuando llega y se encuentra un portón.
        if (!sucursal.allowsPickup) {
          throw new BadRequestException(
            'Esa bodega no atiende retiros, así que no puede recibir una devolución a sucursal.',
          );
        }
      }

      // Se copia y no se cuenta al leer: los intentos se pueden borrar, y esta
      // cifra es la que justifica haberse rendido.
      const intentos = await tx.deliveryAttempt.count({
        where: { shipmentId: dto.shipmentId },
      });

      const creada = await tx.return.create({
        data: {
          tenantId,
          shipmentId: dto.shipmentId,
          destination: dto.destination,
          reason: dto.reason,
          warehouseId: dto.warehouseId,
          notes: dto.notes,
          attemptsBefore: intentos,
          decidedByUserId: actor.userId,
        },
        include: this.detalle,
      });

      await registrar(tx, {
        tenantId,
        shipmentId: dto.shipmentId,
        tipo: ShipmentEventType.RETURN_STARTED,
        description: describirDevolucion(dto.destination, dto.reason),
        actorUserId: actor.userId ?? undefined,
        metadata: {
          returnId: creada.id,
          destination: creada.destination,
          reason: creada.reason,
          attemptsBefore: intentos,
        },
      });

      return creada;
    });

    this.audit.dispatch(tenantId, {
      action: 'return.started',
      entityType: 'return',
      entityId: devolucion.id,
      actor: { userId: actor.userId, role: actor.role },
      metadata: {
        shipmentId: devolucion.shipmentId,
        destination: devolucion.destination,
        reason: devolucion.reason,
      },
    });
    return devolucion;
  }

  /** El bulto sale de vuelta. */
  async enviar(tenantId: string, id: string, actor: AuthUser) {
    return this.cambiar(tenantId, id, ReturnStatus.IN_TRANSIT, actor);
  }

  /**
   * Llegó a su destino. Aquí sí pasa el envío a `RETURNED`.
   *
   * La transición se intenta y no se impone: si el envío ya está en un estado
   * desde el que `RETURNED` no es válido —cancelado, por ejemplo— la devolución
   * se cierra igual y el estado se queda como está. Forzarlo obligaría a
   * duplicar aquí la máquina de estados, que es justo lo que
   * `shipment-status.ts` existe para evitar.
   */
  async completar(
    tenantId: string,
    id: string,
    dto: CompleteReturnDto,
    actor: AuthUser,
  ) {
    const actual = await this.findOne(tenantId, id);
    if (actual.status === ReturnStatus.COMPLETED) {
      throw new BadRequestException('Esta devolución ya está completada.');
    }
    if (actual.status === ReturnStatus.CANCELLED) {
      throw new BadRequestException('Esta devolución se canceló.');
    }

    const devolucion = await this.prisma.withTenant(tenantId, async (tx) => {
      const actualizada = await tx.return.update({
        where: { id },
        data: {
          status: ReturnStatus.COMPLETED,
          completedAt: new Date(),
          ...(dto.notes ? { notes: dto.notes } : {}),
        },
        include: this.detalle,
      });

      await registrar(tx, {
        tenantId,
        shipmentId: actual.shipmentId,
        tipo: ShipmentEventType.RETURN_COMPLETED,
        description:
          actual.destination === ReturnDestination.ABANDONED
            ? 'Devolución cerrada: el bulto quedó como abandonado'
            : 'Devolución completada',
        actorUserId: actor.userId ?? undefined,
        metadata: {
          returnId: id,
          destination: actual.destination,
        },
      });

      return actualizada;
    });

    if (
      canTransition(
        devolucion.shipment.type,
        devolucion.shipment.status,
        ShipmentStatus.RETURNED,
      )
    ) {
      await this.shipments.updateStatus(actor, actual.shipmentId, {
        status: ShipmentStatus.RETURNED,
        description: describirDevolucion(actual.destination, actual.reason),
      });
    }

    this.audit.dispatch(tenantId, {
      action: 'return.completed',
      entityType: 'return',
      entityId: id,
      actor: { userId: actor.userId, role: actor.role },
      metadata: { destination: devolucion.destination },
    });
    return devolucion;
  }

  /** El cliente apareció y lo retiró: la devolución no llega a ocurrir. */
  async cancelar(tenantId: string, id: string, actor: AuthUser) {
    const actual = await this.findOne(tenantId, id);
    if (actual.status === ReturnStatus.COMPLETED) {
      throw new BadRequestException(
        'Una devolución completada no se cancela: el bulto ya volvió.',
      );
    }
    return this.cambiar(tenantId, id, ReturnStatus.CANCELLED, actor);
  }

  private async cambiar(
    tenantId: string,
    id: string,
    destino: ReturnStatus,
    actor: AuthUser,
  ) {
    const actual = await this.findOne(tenantId, id);
    if (actual.status === destino) {
      throw new BadRequestException(`Esta devolución ya está en ${destino}.`);
    }
    if (
      actual.status === ReturnStatus.COMPLETED ||
      actual.status === ReturnStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Una devolución en ${actual.status} ya no se mueve.`,
      );
    }

    const devolucion = await this.prisma.withTenant(tenantId, (tx) =>
      tx.return.update({
        where: { id },
        data: { status: destino },
        include: this.detalle,
      }),
    );

    this.audit.dispatch(tenantId, {
      action: `return.${destino.toLowerCase()}`,
      entityType: 'return',
      entityId: id,
      actor: { userId: actor.userId, role: actor.role },
    });
    return devolucion;
  }

  async list(tenantId: string, query: QueryReturnsDto) {
    const where: Prisma.ReturnWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.destination ? { destination: query.destination } : {}),
      ...(query.reason ? { reason: query.reason } : {}),
    };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [total, items] = await Promise.all([
        tx.return.count({ where }),
        tx.return.findMany({
          where,
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          skip: saltar(query),
          take: query.pageSize,
          include: this.detalle,
        }),
      ]);
      return { items, total, page: query.page, pageSize: query.pageSize };
    });
  }

  /**
   * Por qué vuelve la mercancía.
   *
   * Agrupa por motivo y no sólo cuenta: el total de devoluciones no dice nada
   * accionable, y el reparto sí —si la mitad son `WRONG_ADDRESS` el problema
   * está en la captura de direcciones, y si son `UNPAID` está en el precio—.
   */
  async resumen(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [porMotivo, porDestino, abiertas] = await Promise.all([
        tx.return.groupBy({ by: ['reason'], _count: { _all: true } }),
        tx.return.groupBy({ by: ['destination'], _count: { _all: true } }),
        tx.return.count({
          where: {
            status: { in: [ReturnStatus.PENDING, ReturnStatus.IN_TRANSIT] },
          },
        }),
      ]);
      return {
        abiertas,
        porMotivo: Object.fromEntries(
          porMotivo.map((f) => [f.reason, f._count._all]),
        ),
        porDestino: Object.fromEntries(
          porDestino.map((f) => [f.destination, f._count._all]),
        ),
      };
    });
  }

  async findOne(tenantId: string, id: string) {
    const fila = await this.prisma.withTenant(tenantId, (tx) =>
      tx.return.findUnique({ where: { id }, include: this.detalle }),
    );
    if (!fila) throw new NotFoundException('La devolución no existe');
    return fila;
  }
}
