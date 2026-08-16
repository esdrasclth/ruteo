import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentMethod,
  PaymentStatus,
  Prisma,
  RefundStatus,
  ShipmentEventType,
} from '@prisma/client';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { saltar } from '../../common/dto/paginacion.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { registrar } from '../shipments/eventos';
import { CreateRefundDto } from './dto/create-refund.dto';
import { QueryRefundsDto } from './dto/query-refunds.dto';

/** Lo que hace falta para emitir un reembolso dentro de una transacción ajena. */
export interface EmitirReembolso {
  paymentId: string;
  amount: Prisma.Decimal | number;
  reason: string;
  claimId?: string | null;
  method?: PaymentMethod | null;
  reference?: string | null;
  issuedByUserId?: string | null;
  /** Para escribir el evento en el historial del envío correcto. */
  shipmentId?: string | null;
}

/**
 * Devolver dinero ya cobrado.
 *
 * Es lo que la fase 4 separó de anular a propósito: `ChargeStatus.VOID` es el
 * cargo que nunca debió emitirse —no hubo caja de por medio— y esto es el que
 * se cobró bien y hay que devolver. Mezclarlos haría que «cuánto facturamos»
 * y «cuánto devolvimos» fueran la misma resta, y son dos preguntas.
 */
@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private readonly detalle = {
    payment: {
      select: {
        id: true,
        type: true,
        amount: true,
        currency: true,
        shipmentId: true,
      },
    },
    claim: { select: { id: true, number: true, type: true } },
  } satisfies Prisma.RefundInclude;

  /**
   * Emite dentro de la transacción de quien llama.
   *
   * Existe para que liquidar un reclamo sea **un solo hecho**: si el reembolso
   * se creara en su propia transacción, un fallo entre las dos dejaría el
   * reclamo liquidado sin dinero devuelto, o el dinero fuera y el reclamo
   * pidiendo pagarlo otra vez.
   */
  async emitirEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    datos: EmitirReembolso,
  ) {
    const pago = await tx.payment.findUnique({
      where: { id: datos.paymentId },
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        shipmentId: true,
      },
    });
    if (!pago) throw new NotFoundException('El pago no existe');

    // No se devuelve lo que no se cobró. Un pago PENDING no tiene dinero
    // detrás: lo que corresponde ahí es anular el cargo, no reembolsar.
    if (
      pago.status !== PaymentStatus.COLLECTED &&
      pago.status !== PaymentStatus.REMITTED
    ) {
      throw new BadRequestException(
        'Sólo se puede reembolsar un pago que se llegó a cobrar.',
      );
    }

    const importe = new Prisma.Decimal(datos.amount);
    if (importe.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'El importe a devolver debe ser mayor que cero.',
      );
    }

    // El tope es lo cobrado MENOS lo ya devuelto, no lo cobrado a secas: sin
    // restar lo anterior, dos reembolsos parciales del 60% pasarían los dos y
    // se devolvería el 120%.
    const previos = await tx.refund.aggregate({
      where: {
        paymentId: datos.paymentId,
        status: { in: [RefundStatus.PENDING, RefundStatus.COMPLETED] },
      },
      _sum: { amount: true },
    });
    const yaDevuelto = previos._sum.amount ?? new Prisma.Decimal(0);
    const disponible = pago.amount.minus(yaDevuelto);
    if (importe.greaterThan(disponible)) {
      throw new BadRequestException(
        `No se puede devolver ${importe.toString()}: de ese pago sólo quedan ${disponible.toString()} sin devolver.`,
      );
    }

    const reembolso = await tx.refund.create({
      data: {
        tenantId,
        paymentId: datos.paymentId,
        claimId: datos.claimId ?? null,
        amount: importe,
        currency: pago.currency,
        method: datos.method ?? null,
        reason: datos.reason,
        reference: datos.reference ?? null,
        issuedByUserId: datos.issuedByUserId ?? null,
      },
    });

    const shipmentId = datos.shipmentId ?? pago.shipmentId;
    if (shipmentId) {
      await registrar(tx, {
        tenantId,
        shipmentId,
        tipo: ShipmentEventType.REFUND_ISSUED,
        description: `Reembolso emitido por ${pago.currency} ${importe.toString()}`,
        actorUserId: datos.issuedByUserId ?? undefined,
        metadata: {
          refundId: reembolso.id,
          amount: importe.toString(),
          currency: pago.currency,
          claimId: datos.claimId ?? null,
        },
      });
    }

    return reembolso;
  }

  /** Emitir suelto, sin reclamo de por medio: una devolución que sale cara. */
  async emitir(tenantId: string, dto: CreateRefundDto, actor: AuthUser) {
    const reembolso = await this.prisma.withTenant(tenantId, (tx) =>
      this.emitirEnTx(tx, tenantId, {
        paymentId: dto.paymentId,
        amount: dto.amount,
        reason: dto.reason,
        method: dto.method,
        reference: dto.reference,
        issuedByUserId: actor.userId,
      }),
    );

    this.audit.dispatch(tenantId, {
      action: 'refund.issued',
      entityType: 'refund',
      entityId: reembolso.id,
      actor: { userId: actor.userId, role: actor.role },
      metadata: {
        paymentId: dto.paymentId,
        amount: reembolso.amount.toString(),
      },
    });
    return reembolso;
  }

  /**
   * Marca que el dinero salió de verdad.
   *
   * Nace `PENDING` y no `COMPLETED` porque emitir y pagar son dos momentos:
   * una transferencia se aprueba hoy y se ejecuta mañana. Darlo por hecho al
   * crearlo haría que la caja cuadrara en el sistema y no en el banco.
   */
  async completar(tenantId: string, id: string, actor: AuthUser) {
    const actual = await this.findOne(tenantId, id);
    if (actual.status !== RefundStatus.PENDING) {
      throw new BadRequestException(
        `Este reembolso ya está en ${actual.status}.`,
      );
    }

    const reembolso = await this.prisma.withTenant(tenantId, (tx) =>
      tx.refund.update({
        where: { id },
        data: { status: RefundStatus.COMPLETED, completedAt: new Date() },
        include: this.detalle,
      }),
    );

    this.audit.dispatch(tenantId, {
      action: 'refund.completed',
      entityType: 'refund',
      entityId: id,
      actor: { userId: actor.userId, role: actor.role },
      metadata: { amount: reembolso.amount.toString() },
    });
    return reembolso;
  }

  /** No salió: el banco lo rechazó, la tarjeta no admitía la devolución. */
  async fallar(tenantId: string, id: string, actor: AuthUser) {
    const actual = await this.findOne(tenantId, id);
    if (actual.status !== RefundStatus.PENDING) {
      throw new BadRequestException(
        `Este reembolso ya está en ${actual.status}.`,
      );
    }

    const reembolso = await this.prisma.withTenant(tenantId, (tx) =>
      tx.refund.update({
        where: { id },
        data: { status: RefundStatus.FAILED },
        include: this.detalle,
      }),
    );

    this.audit.dispatch(tenantId, {
      action: 'refund.failed',
      entityType: 'refund',
      entityId: id,
      actor: { userId: actor.userId, role: actor.role },
    });
    return reembolso;
  }

  async list(tenantId: string, query: QueryRefundsDto) {
    const where: Prisma.RefundWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.paymentId ? { paymentId: query.paymentId } : {}),
      ...(query.claimId ? { claimId: query.claimId } : {}),
    };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [total, items] = await Promise.all([
        tx.refund.count({ where }),
        tx.refund.findMany({
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

  async findOne(tenantId: string, id: string) {
    const fila = await this.prisma.withTenant(tenantId, (tx) =>
      tx.refund.findUnique({ where: { id }, include: this.detalle }),
    );
    if (!fila) throw new NotFoundException('El reembolso no existe');
    return fila;
  }
}
