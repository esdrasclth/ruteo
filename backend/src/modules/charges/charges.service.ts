import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChargeStatus,
  PaymentStatus,
  PaymentType,
  Prisma,
  ShipmentEventType,
} from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { saltar } from '../../common/dto/paginacion.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NATURALEZA_POR_DEFECTO } from '../customs/cargos';
import { registrar } from '../shipments/eventos';
import { AnularCargoDto, CreateChargeDto } from './dto/create-charge.dto';
import { CobrarCargosDto } from './dto/cobrar-cargos.dto';
import { QueryChargesDto, RangoCargosDto } from './dto/query-charges.dto';
import { CargoDeSaldo, desglosar } from './saldo';

const DIAS_POR_DEFECTO = 30;

/**
 * Los cargos de un envío: qué se le cobra, de quién es ese dinero y si ya entró.
 *
 * La liquidación aduanera ya los venía creando sola desde la fase 4.1, pero no
 * había forma de verlos, añadir uno a mano ni cobrarlos. Eso es lo que hay aquí.
 */
@Injectable()
export class ChargesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private readonly detalle = {
    shipment: {
      select: { id: true, trackingNumber: true, recipientName: true },
    },
    payment: { select: { id: true, method: true, reference: true } },
  } satisfies Prisma.ChargeInclude;

  /**
   * Un cargo a mano: el reempaque, el almacenaje, el flete que no salió de una
   * liquidación.
   *
   * Nace con `source: 'manual'` —el valor por defecto de la columna— y eso lo
   * protege: recalcular la aduana borra y rehace solo los de `source: 'customs'`,
   * así que un cargo puesto a mano no desaparece porque alguien tocó el valor
   * declarado.
   */
  async create(actor: AuthUser, dto: CreateChargeDto) {
    const { tenantId } = actor;
    const cargo = await this.prisma.withTenant(tenantId, async (tx) => {
      const envio = await tx.shipment.findUnique({
        where: { id: dto.shipmentId },
        select: { id: true, currency: true },
      });
      if (!envio) throw new NotFoundException('El envío no existe');

      const creado = await tx.charge.create({
        data: {
          tenantId,
          shipmentId: dto.shipmentId,
          concept: dto.concept,
          // La naturaleza habitual del concepto es solo el DEFECTO: se guarda en
          // la fila, no se deduce al leer.
          kind: dto.kind ?? NATURALEZA_POR_DEFECTO[dto.concept],
          amount: new Prisma.Decimal(dto.amount),
          currency: dto.currency ?? envio.currency,
          notes: dto.notes,
        },
        include: this.detalle,
      });

      // Interno: lo que el cliente ve del dinero es lo que se le cobra al
      // pagar, no cada línea según se va emitiendo.
      await registrar(tx, {
        tenantId,
        shipmentId: dto.shipmentId,
        tipo: ShipmentEventType.CHARGE_ADDED,
        description: `Cargo añadido: ${creado.concept} ${creado.amount.toFixed(2)} ${creado.currency}`,
        actorUserId: actor.userId,
        metadata: {
          chargeId: creado.id,
          concept: creado.concept,
          kind: creado.kind,
          amount: creado.amount.toString(),
          currency: creado.currency,
        },
      });

      return creado;
    });

    this.audit.dispatch(tenantId, {
      action: 'charge.created',
      entityType: 'charge',
      entityId: cargo.id,
      actor: { userId: actor.userId, role: actor.role },
      metadata: {
        concept: cargo.concept,
        kind: cargo.kind,
        amount: cargo.amount.toString(),
        currency: cargo.currency,
        shipmentId: cargo.shipmentId,
      },
    });
    return cargo;
  }

  // Paginado: se emite un cargo por concepto y por envío, así que esta tabla
  // crece más rápido que la de envíos y no para nunca.
  async list(tenantId: string, query: QueryChargesDto) {
    const where: Prisma.ChargeWhereInput = {
      ...(query.shipmentId ? { shipmentId: query.shipmentId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.concept ? { concept: query.concept } : {}),
    };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [total, items] = await Promise.all([
        tx.charge.count({ where }),
        tx.charge.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: saltar(query),
          take: query.pageSize,
          include: this.detalle,
        }),
      ]);
      return { items, total, page: query.page, pageSize: query.pageSize };
    });
  }

  /** Todos los cargos de un envío con sus cuentas hechas. Alimenta la tarjeta del detalle. */
  async porEnvio(tenantId: string, shipmentId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const items = await tx.charge.findMany({
        where: { shipmentId },
        orderBy: { createdAt: 'asc' },
        include: this.detalle,
      });
      return {
        items,
        // La moneda sale de los propios cargos: un envío puede tener el flete en
        // dólares y los tributos en lempiras, y el total de la tarjeta tiene que
        // decir de qué está hablando.
        moneda: items[0]?.currency ?? null,
        ...desglosar(items),
      };
    });
  }

  /**
   * El cierre de mes: cuánto de lo emitido es ingreso propio y cuánto tributo.
   *
   * Se agrega en la base y no en memoria. Traerse los cargos del período para
   * sumarlos aquí funciona el primer mes y deja de funcionar cuando la empresa
   * lleva un año operando.
   */
  async resumen(tenantId: string, rango: RangoCargosDto) {
    const hasta = rango.to ? new Date(rango.to) : new Date();
    const desde = rango.from
      ? new Date(rango.from)
      : new Date(hasta.getTime() - DIAS_POR_DEFECTO * 24 * 60 * 60 * 1000);
    const where: Prisma.ChargeWhereInput = {
      createdAt: { gte: desde, lte: hasta },
    };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [porNaturaleza, porConcepto] = await Promise.all([
        tx.charge.groupBy({
          by: ['status', 'kind'],
          where,
          _sum: { amount: true },
          _count: { _all: true },
        }),
        tx.charge.groupBy({
          by: ['concept'],
          where: { ...where, status: { not: ChargeStatus.VOID } },
          _sum: { amount: true },
          _count: { _all: true },
        }),
      ]);

      // Cada grupo se convierte en una fila con su suma. Como todo lo que hace
      // `desglosar` son sumas, agregar antes o después da lo mismo, y así la
      // regla de qué cuenta y qué no vive en un solo sitio.
      const filas: CargoDeSaldo[] = porNaturaleza.map((g) => ({
        status: g.status,
        kind: g.kind,
        amount: g._sum.amount ?? new Prisma.Decimal(0),
      }));

      return {
        desde,
        hasta,
        ...desglosar(filas),
        porConcepto: porConcepto.map((g) => ({
          concept: g.concept,
          amount: g._sum.amount ?? new Prisma.Decimal(0),
          count: g._count._all,
        })),
      };
    });
  }

  /**
   * Cobra varios cargos con un solo pago.
   *
   * Es la operación que conecta `Charge` con `Payment`, que hasta ahora eran dos
   * verdades separadas sobre el mismo dinero.
   */
  async cobrar(actor: AuthUser, dto: CobrarCargosDto) {
    const { tenantId } = actor;
    const resultado = await this.prisma.withTenant(tenantId, async (tx) => {
      const cargos = await tx.charge.findMany({
        where: { id: { in: dto.chargeIds } },
      });

      // El RLS ya filtra por tenant, así que un id de otra empresa simplemente
      // no aparece. Se comprueba el conteo para que eso salga como error y no
      // como un cobro silenciosamente incompleto.
      if (cargos.length !== dto.chargeIds.length) {
        throw new NotFoundException('Algún cargo no existe');
      }

      const noPendientes = cargos.filter(
        (c) => c.status !== ChargeStatus.PENDING,
      );
      if (noPendientes.length > 0) {
        throw new BadRequestException(
          'Solo se pueden cobrar cargos pendientes: hay alguno ya cobrado o anulado.',
        );
      }

      // Un pago lleva UN envío (`Payment.shipmentId`), así que un cobro que
      // cruzara varios no podría decir a cuál pertenece. Mejor negarse que
      // guardar un pago que apunta a uno de ellos y miente sobre el resto.
      const envios = new Set(cargos.map((c) => c.shipmentId));
      if (envios.size > 1) {
        throw new BadRequestException(
          'Un cobro no puede mezclar cargos de envíos distintos.',
        );
      }

      // Sumar monedas distintas da un número que no es dinero de ninguna.
      const monedas = new Set(cargos.map((c) => c.currency));
      if (monedas.size > 1) {
        throw new BadRequestException(
          'Un cobro no puede mezclar monedas distintas.',
        );
      }

      const total = cargos.reduce(
        (t, c) => t.plus(c.amount),
        new Prisma.Decimal(0),
      );
      const cobradoEn = new Date();

      const pago = await tx.payment.create({
        data: {
          tenantId,
          shipmentId: cargos[0].shipmentId,
          type: PaymentType.CHARGES,
          amount: total,
          currency: cargos[0].currency,
          method: dto.method,
          reference: dto.reference,
          // Nace COLLECTED: registrar el cobro ES el hecho de haber cobrado.
          // Un pago PENDING aquí sería una deuda, y la deuda ya la lleva el
          // propio cargo.
          status: PaymentStatus.COLLECTED,
          collectedAt: cobradoEn,
        },
      });

      await tx.charge.updateMany({
        where: { id: { in: dto.chargeIds } },
        data: {
          status: ChargeStatus.PAID,
          paidAt: cobradoEn,
          paymentId: pago.id,
        },
      });

      // Público: que su pago quedó registrado es exactamente lo que un cliente
      // quiere poder comprobar sin llamar a nadie.
      await registrar(tx, {
        tenantId,
        shipmentId: cargos[0].shipmentId,
        tipo: ShipmentEventType.CHARGE_COLLECTED,
        description: `Pago recibido: ${total.toFixed(2)} ${cargos[0].currency}`,
        actorUserId: actor.userId,
        metadata: {
          paymentId: pago.id,
          amount: total.toString(),
          currency: cargos[0].currency,
          method: dto.method ?? null,
          reference: dto.reference ?? null,
          conceptos: cargos.map((c) => c.concept),
        },
      });

      return {
        payment: pago,
        charges: await tx.charge.findMany({
          where: { id: { in: dto.chargeIds } },
          include: this.detalle,
        }),
      };
    });

    this.audit.dispatch(tenantId, {
      action: 'charge.collected',
      entityType: 'payment',
      entityId: resultado.payment.id,
      actor: { userId: actor.userId, role: actor.role },
      metadata: {
        amount: resultado.payment.amount.toString(),
        currency: resultado.payment.currency,
        method: dto.method ?? null,
        chargeIds: dto.chargeIds,
      },
    });
    return resultado;
  }

  /**
   * Anula un cargo. No lo borra: que existió y se anuló es información, y
   * borrarlo dejaría un hueco imposible de explicar en el cierre.
   */
  async anular(actor: AuthUser, id: string, dto: AnularCargoDto) {
    const { tenantId } = actor;
    const cargo = await this.prisma.withTenant(tenantId, async (tx) => {
      const actual = await tx.charge.findUnique({ where: { id } });
      if (!actual) throw new NotFoundException('El cargo no existe');

      // Un cargo ya cobrado no se anula: se devuelve. Marcarlo VOID dejaría el
      // pago apuntando a un cargo que dice no haber existido, y el dinero que
      // entró seguiría en la caja sin nada que lo justifique.
      if (actual.status === ChargeStatus.PAID) {
        throw new BadRequestException(
          'Un cargo ya cobrado no se puede anular. Hay que devolverlo.',
        );
      }
      if (actual.status === ChargeStatus.VOID) {
        throw new BadRequestException('El cargo ya está anulado.');
      }

      return tx.charge.update({
        where: { id },
        data: {
          status: ChargeStatus.VOID,
          // El motivo se apila sobre las notas que ya tuviera: son el historial
          // de la fila y pisarlas perdería lo que dijo quien la creó.
          notes: actual.notes
            ? `${actual.notes}\nAnulado: ${dto.motivo}`
            : `Anulado: ${dto.motivo}`,
        },
        include: this.detalle,
      });
    });

    this.audit.dispatch(tenantId, {
      action: 'charge.voided',
      entityType: 'charge',
      entityId: id,
      actor: { userId: actor.userId, role: actor.role },
      metadata: {
        amount: cargo.amount.toString(),
        currency: cargo.currency,
        motivo: dto.motivo,
      },
    });
    return cargo;
  }
}
