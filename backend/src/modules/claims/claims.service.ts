import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClaimStatus,
  ClaimType,
  NotificationChannel,
  Prisma,
  ShipmentEventType,
} from '@prisma/client';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { saltar } from '../../common/dto/paginacion.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RefundsService } from '../refunds/refunds.service';
import { registrar } from '../shipments/eventos';
import { mensajeDeReclamo } from './claim-message';
import { generarCodigoReclamo } from './claim-code';
import { puedePasar } from './claim-status';
import { AddClaimFileDto } from './dto/add-claim-file.dto';
import { CreateClaimDto } from './dto/create-claim.dto';
import { QueryClaimsDto } from './dto/query-claims.dto';
import {
  ApproveClaimDto,
  RejectClaimDto,
  SettleClaimDto,
} from './dto/resolve-claim.dto';

/**
 * Reclamos del cliente.
 *
 * Entidad aparte de `Exception` porque el actor y el desenlace son otros: la
 * excepción la abre la bodega y se cierra arreglando algo; el reclamo lo abre
 * el cliente y se cierra con dinero o con un no razonado. Las dos pueden
 * hablar del mismo hecho —el bulto llegó roto— y por eso un reclamo puede
 * enlazar la excepción de la que salió.
 */
@Injectable()
export class ClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly refunds: RefundsService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  private readonly detalle = {
    shipment: {
      select: {
        id: true,
        trackingNumber: true,
        status: true,
        recipientPhone: true,
      },
    },
    customer: { select: { id: true, name: true, email: true, phone: true } },
    exception: { select: { id: true, type: true, status: true } },
    charge: {
      select: { id: true, concept: true, amount: true, currency: true },
    },
    refunds: {
      select: { id: true, amount: true, currency: true, status: true },
    },
  } satisfies Prisma.ClaimInclude;

  async create(tenantId: string, dto: CreateClaimDto, actor: AuthUser) {
    // Un cargo en discusión sólo tiene sentido si lo que se discute es un
    // cobro. Aceptarlo en un reclamo por daño deja un enlace que después nadie
    // sabe si significa «este cargo está mal» o «este es el cargo del envío».
    if (dto.chargeId && dto.type !== ClaimType.WRONG_CHARGE) {
      throw new BadRequestException(
        'Sólo un reclamo por cobro indebido puede señalar un cargo.',
      );
    }

    // Reintento por colisión de código, igual que los casilleros: el código es
    // aleatorio, así que la colisión es improbable pero no imposible, y
    // dejarla sin manejar la convierte en un 500 aleatorio.
    for (let intento = 0; intento < 3; intento++) {
      const number = generarCodigoReclamo();
      try {
        const reclamo = await this.prisma.withTenant(tenantId, async (tx) => {
          const envio = await tx.shipment.findUnique({
            where: { id: dto.shipmentId },
            select: { id: true, trackingNumber: true, customerId: true },
          });
          if (!envio) throw new NotFoundException('El envío no existe');

          const creado = await tx.claim.create({
            data: {
              tenantId,
              number,
              type: dto.type,
              shipmentId: dto.shipmentId,
              packageId: dto.packageId,
              // Si no dicen quién reclama, el cliente del envío es la mejor
              // respuesta disponible y evita reclamos huérfanos que después no
              // se pueden agrupar por persona.
              customerId: dto.customerId ?? envio.customerId,
              exceptionId: dto.exceptionId,
              chargeId: dto.chargeId,
              description: dto.description,
              claimedAmount: dto.claimedAmount,
              currency: dto.currency ?? 'USD',
              assignedToUserId: dto.assignedToUserId,
              openedByUserId: actor.userId,
            },
            include: this.detalle,
          });

          await registrar(tx, {
            tenantId,
            shipmentId: dto.shipmentId,
            tipo: ShipmentEventType.CLAIM_OPENED,
            description: `Reclamo ${creado.number} abierto: ${creado.description}`,
            actorUserId: actor.userId ?? undefined,
            metadata: {
              claimId: creado.id,
              number: creado.number,
              type: creado.type,
              claimedAmount: creado.claimedAmount?.toString() ?? null,
            },
          });

          return creado;
        });

        this.audit.dispatch(tenantId, {
          action: 'claim.opened',
          entityType: 'claim',
          entityId: reclamo.id,
          actor: { userId: actor.userId, role: actor.role },
          metadata: { number: reclamo.number, type: reclamo.type },
        });
        this.avisar(tenantId, reclamo, ClaimStatus.OPEN);
        return reclamo;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          intento < 2
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new BadRequestException(
      'No se pudo generar un código de reclamo libre. Inténtalo de nuevo.',
    );
  }

  async list(tenantId: string, query: QueryClaimsDto) {
    const where: Prisma.ClaimWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.shipmentId ? { shipmentId: query.shipmentId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
    };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [total, items] = await Promise.all([
        tx.claim.count({ where }),
        tx.claim.findMany({
          where,
          // Los abiertos primero: es una bandeja de trabajo. Ordenar sólo por
          // fecha esconde debajo el reclamo de la semana pasada que nadie tocó,
          // que es justo el que ya va a acabar en una llamada enfadada.
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          skip: saltar(query),
          take: query.pageSize,
          include: this.detalle,
        }),
      ]);
      return { items, total, page: query.page, pageSize: query.pageSize };
    });
  }

  /** Cuántos hay sin cerrar y cuánto dinero está en juego. Alimenta el tablero. */
  async resumen(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [porEstado, enJuego] = await Promise.all([
        tx.claim.groupBy({ by: ['status'], _count: { _all: true } }),
        tx.claim.aggregate({
          where: {
            status: { in: [ClaimStatus.OPEN, ClaimStatus.INVESTIGATING] },
          },
          _sum: { claimedAmount: true },
        }),
      ]);
      return {
        abiertos: porEstado
          .filter(
            (f) =>
              f.status === ClaimStatus.OPEN ||
              f.status === ClaimStatus.INVESTIGATING,
          )
          .reduce((n, f) => n + f._count._all, 0),
        porEstado: Object.fromEntries(
          porEstado.map((f) => [f.status, f._count._all]),
        ),
        // Lo reclamado y todavía sin decidir. No es una deuda —la mitad se
        // rechazará— pero es la cifra que dice cuánto puede doler.
        reclamadoAbierto: enJuego._sum.claimedAmount?.toString() ?? '0',
      };
    });
  }

  async findOne(tenantId: string, id: string) {
    const fila = await this.prisma.withTenant(tenantId, (tx) =>
      tx.claim.findUnique({ where: { id }, include: this.detalle }),
    );
    if (!fila) throw new NotFoundException('El reclamo no existe');
    return fila;
  }

  /** Lo toma alguien y se pone a investigarlo. */
  async investigar(tenantId: string, id: string, actor: AuthUser) {
    return this.cambiarEstado(tenantId, id, ClaimStatus.INVESTIGATING, actor, {
      assignedToUserId: actor.userId,
    });
  }

  async aprobar(
    tenantId: string,
    id: string,
    dto: ApproveClaimDto,
    actor: AuthUser,
  ) {
    return this.cambiarEstado(tenantId, id, ClaimStatus.APPROVED, actor, {
      approvedAmount: dto.approvedAmount,
      resolution: dto.resolution,
      resolvedByUserId: actor.userId,
      resolvedAt: new Date(),
    });
  }

  async rechazar(
    tenantId: string,
    id: string,
    dto: RejectClaimDto,
    actor: AuthUser,
  ) {
    return this.cambiarEstado(tenantId, id, ClaimStatus.REJECTED, actor, {
      resolution: dto.resolution,
      resolvedByUserId: actor.userId,
      resolvedAt: new Date(),
    });
  }

  /**
   * Liquidar: emitir el reembolso y cerrar.
   *
   * El reembolso se crea en la MISMA transacción que el cambio de estado. Con
   * dos pasos sueltos, un fallo entre medias deja un reclamo liquidado sin
   * dinero devuelto —o el dinero devuelto y el reclamo pidiendo que se pague
   * otra vez—, y las dos formas de quedar mal son caras.
   */
  async liquidar(
    tenantId: string,
    id: string,
    dto: SettleClaimDto,
    actor: AuthUser,
  ) {
    const actual = await this.findOne(tenantId, id);
    if (!puedePasar(actual.status, ClaimStatus.SETTLED)) {
      throw new BadRequestException(
        `Un reclamo en ${actual.status} no se puede liquidar; primero hay que aprobarlo.`,
      );
    }
    if (actual.approvedAmount == null || actual.approvedAmount.equals(0)) {
      throw new BadRequestException(
        'Para liquidar hace falta un importe aprobado mayor que cero.',
      );
    }

    const reclamo = await this.prisma.withTenant(tenantId, async (tx) => {
      await this.refunds.emitirEnTx(tx, tenantId, {
        paymentId: dto.paymentId,
        claimId: id,
        amount: actual.approvedAmount!,
        method: dto.method,
        reference: dto.reference,
        reason: `Reclamo ${actual.number}`,
        issuedByUserId: actor.userId,
        shipmentId: actual.shipmentId,
      });

      const actualizado = await tx.claim.update({
        where: { id },
        data: { status: ClaimStatus.SETTLED },
        include: this.detalle,
      });

      await registrar(tx, {
        tenantId,
        shipmentId: actual.shipmentId,
        tipo: ShipmentEventType.CLAIM_RESOLVED,
        description: `Reclamo ${actual.number} liquidado`,
        actorUserId: actor.userId ?? undefined,
        metadata: {
          claimId: id,
          number: actual.number,
          status: ClaimStatus.SETTLED,
          approvedAmount: actual.approvedAmount!.toString(),
        },
      });

      return actualizado;
    });

    this.audit.dispatch(tenantId, {
      action: 'claim.settled',
      entityType: 'claim',
      entityId: id,
      actor: { userId: actor.userId, role: actor.role },
      metadata: {
        number: reclamo.number,
        approvedAmount: reclamo.approvedAmount?.toString(),
      },
    });
    this.avisar(tenantId, reclamo, ClaimStatus.SETTLED);
    return reclamo;
  }

  private async cambiarEstado(
    tenantId: string,
    id: string,
    destino: ClaimStatus,
    actor: AuthUser,
    datos: Prisma.ClaimUncheckedUpdateInput,
  ) {
    const actual = await this.findOne(tenantId, id);
    if (!puedePasar(actual.status, destino)) {
      throw new BadRequestException(
        `Un reclamo en ${actual.status} no puede pasar a ${destino}.`,
      );
    }

    const reclamo = await this.prisma.withTenant(tenantId, async (tx) => {
      const actualizado = await tx.claim.update({
        where: { id },
        data: { status: destino, ...datos },
        include: this.detalle,
      });

      // Sólo los desenlaces van al historial del envío. Que alguien lo tomara
      // para investigar es movimiento interno, y el historial del envío lo lee
      // el cliente.
      if (
        destino === ClaimStatus.APPROVED ||
        destino === ClaimStatus.REJECTED
      ) {
        await registrar(tx, {
          tenantId,
          shipmentId: actual.shipmentId,
          tipo: ShipmentEventType.CLAIM_RESOLVED,
          description: `Reclamo ${actual.number} ${destino === ClaimStatus.APPROVED ? 'aprobado' : 'rechazado'}`,
          actorUserId: actor.userId ?? undefined,
          metadata: {
            claimId: id,
            number: actual.number,
            status: destino,
            approvedAmount: actualizado.approvedAmount?.toString() ?? null,
          },
        });
      }

      return actualizado;
    });

    this.audit.dispatch(tenantId, {
      action: `claim.${destino.toLowerCase()}`,
      entityType: 'claim',
      entityId: id,
      actor: { userId: actor.userId, role: actor.role },
      metadata: { number: reclamo.number, status: destino },
    });
    this.avisar(tenantId, reclamo, destino);
    return reclamo;
  }

  /**
   * Le cuenta al cliente en qué va lo suyo.
   *
   * Aquí sí se le escribe al cliente —al revés que con las excepciones— porque
   * el reclamo lo abrió él: callarse el avance de algo que la persona preguntó
   * es lo que genera la llamada.
   *
   * Prefiere el teléfono del cliente y cae al del destinatario del envío: quien
   * reclama suele ser quien recibe, pero no siempre, y sin la segunda vía un
   * reclamo abierto por mostrador se quedaba sin avisar a nadie.
   */
  private avisar(
    tenantId: string,
    reclamo: {
      number: string;
      currency: string;
      shipmentId: string;
      approvedAmount: Prisma.Decimal | null;
      shipment: { trackingNumber: string; recipientPhone: string | null };
      customer: { email: string | null; phone: string | null } | null;
    },
    status: ClaimStatus,
  ) {
    const telefono = reclamo.customer?.phone ?? reclamo.shipment.recipientPhone;
    const correo = reclamo.customer?.email;
    const canal = telefono
      ? NotificationChannel.SMS
      : correo
        ? NotificationChannel.EMAIL
        : null;
    const destinatario = telefono ?? correo;
    if (!canal || !destinatario) return;

    this.notifications.dispatch(tenantId, {
      channel: canal,
      recipient: destinatario,
      type: 'claim.updated',
      body: mensajeDeReclamo(
        reclamo.number,
        reclamo.shipment.trackingNumber,
        status,
        {
          importe: reclamo.approvedAmount?.toString() ?? null,
          moneda: reclamo.currency,
        },
      ),
      shipmentId: reclamo.shipmentId,
    });
  }

  async addFile(tenantId: string, claimId: string, dto: AddClaimFileDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const reclamo = await tx.claim.findUnique({
        where: { id: claimId },
        select: { id: true },
      });
      if (!reclamo) throw new NotFoundException('El reclamo no existe');

      const archivo = await tx.fileObject.findUnique({
        where: { id: dto.fileId },
        select: { id: true },
      });
      if (!archivo) throw new NotFoundException('El archivo no existe');

      return tx.claimFile.create({
        data: {
          tenantId,
          claimId,
          fileId: dto.fileId,
          fromCustomer: dto.fromCustomer ?? false,
          notes: dto.notes,
        },
      });
    });
  }

  async listFiles(tenantId: string, claimId: string) {
    const filas = await this.prisma.withTenant(tenantId, (tx) =>
      tx.claimFile.findMany({
        where: { claimId },
        orderBy: { createdAt: 'asc' },
        include: { file: { select: { key: true, originalName: true } } },
      }),
    );

    // Firmada al leer y por minutos, como el resto de archivos del sistema.
    return Promise.all(
      filas.map(async (fila) => ({
        id: fila.id,
        fromCustomer: fila.fromCustomer,
        notes: fila.notes,
        createdAt: fila.createdAt,
        originalName: fila.file.originalName,
        url: await this.storage
          .firmarDescarga(fila.file.key, tenantId)
          .catch(() => null),
      })),
    );
  }
}
