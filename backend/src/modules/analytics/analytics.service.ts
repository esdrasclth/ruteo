import { Injectable } from '@nestjs/common';
import {
  CustomsStatus,
  DeliveryOutcome,
  ExceptionStatus,
  NotificationStatus,
  PackageStatus,
  PaymentStatus,
  PaymentType,
  Prisma,
  ShipmentStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsRangeDto } from './dto/analytics-range.dto';

interface Range {
  from: Date;
  to: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveRange(dto: AnalyticsRangeDto): Range {
    const to = dto.to ? new Date(dto.to) : new Date();
    const from = dto.from ? new Date(dto.from) : new Date(to.getTime() - 30 * DAY_MS);
    return { from, to };
  }

  private amount(v: Prisma.Decimal | null): string {
    return (v ?? new Prisma.Decimal(0)).toString();
  }

  async overview(tenantId: string, dto: AnalyticsRangeDto) {
    const { from, to } = this.resolveRange(dto);
    const createdAt = { gte: from, lte: to };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [shipmentByStatus, codByStatus, revenueByStatus, notifByStatus] =
        await Promise.all([
          tx.shipment.groupBy({
            by: ['status'],
            where: { createdAt },
            _count: { _all: true },
          }),
          tx.payment.groupBy({
            by: ['status'],
            where: { type: PaymentType.COD, createdAt },
            _sum: { amount: true },
            _count: { _all: true },
          }),
          tx.payment.groupBy({
            by: ['status'],
            where: { type: PaymentType.SUBSCRIPTION, createdAt },
            _sum: { amount: true },
            _count: { _all: true },
          }),
          tx.notification.groupBy({
            by: ['status'],
            where: { createdAt },
            _count: { _all: true },
          }),
        ]);

      const statusCount = (rows: typeof shipmentByStatus, status: string) =>
        rows.find((r) => r.status === status)?._count._all ?? 0;
      const total = shipmentByStatus.reduce((s, r) => s + r._count._all, 0);
      const delivered = statusCount(shipmentByStatus, 'DELIVERED');

      const codSum = (status: PaymentStatus) =>
        this.amount(codByStatus.find((r) => r.status === status)?._sum.amount ?? null);
      const revenueSum = (status: PaymentStatus) =>
        this.amount(
          revenueByStatus.find((r) => r.status === status)?._sum.amount ?? null,
        );
      const notifCount = (status: NotificationStatus) =>
        notifByStatus.find((r) => r.status === status)?._count._all ?? 0;

      return {
        range: { from, to },
        shipments: {
          total,
          delivered,
          failed: statusCount(shipmentByStatus, 'FAILED_ATTEMPT'),
          returned: statusCount(shipmentByStatus, 'RETURNED'),
          cancelled: statusCount(shipmentByStatus, 'CANCELLED'),
          deliveryRate: total > 0 ? Number((delivered / total).toFixed(4)) : 0,
        },
        cod: {
          pending: codSum(PaymentStatus.PENDING),
          collected: codSum(PaymentStatus.COLLECTED),
          remitted: codSum(PaymentStatus.REMITTED),
        },
        revenue: {
          pending: revenueSum(PaymentStatus.PENDING),
          collected: revenueSum(PaymentStatus.COLLECTED),
          remitted: revenueSum(PaymentStatus.REMITTED),
        },
        notifications: {
          sent: notifCount(NotificationStatus.SENT),
          failed: notifCount(NotificationStatus.FAILED),
        },
      };
    });
  }

  async shipments(tenantId: string, dto: AnalyticsRangeDto) {
    const { from, to } = this.resolveRange(dto);
    const createdAt = { gte: from, lte: to };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [byStatus, byType, daily] = await Promise.all([
        tx.shipment.groupBy({
          by: ['status'],
          where: { createdAt },
          _count: { _all: true },
        }),
        tx.shipment.groupBy({
          by: ['type'],
          where: { createdAt },
          _count: { _all: true },
        }),
        // generate_series produce TODOS los días del rango; el LEFT JOIN deja en
        // 0 los que no tienen envíos. Sin esto la serie solo traía los días con
        // datos y el gráfico dibujaba 3 puntos para un rango de 30 días.
        tx.$queryRaw<{ day: Date; count: bigint }[]>`
          SELECT d.day AS day, COUNT(s.id) AS count
          FROM generate_series(
                 date_trunc('day', ${from}::timestamptz),
                 date_trunc('day', ${to}::timestamptz),
                 '1 day'::interval
               ) AS d(day)
          LEFT JOIN shipments s
            ON s.created_at >= d.day
           AND s.created_at < d.day + '1 day'::interval
           AND s.created_at >= ${from}
           AND s.created_at <= ${to}
          GROUP BY d.day
          ORDER BY d.day ASC`,
      ]);

      return {
        range: { from, to },
        byStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
        byType: byType.map((r) => ({ type: r.type, count: r._count._all })),
        daily: daily.map((r) => ({
          date: r.day.toISOString().slice(0, 10),
          count: Number(r.count),
        })),
      };
    });
  }

  async payments(tenantId: string, dto: AnalyticsRangeDto) {
    const { from, to } = this.resolveRange(dto);
    const createdAt = { gte: from, lte: to };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const rows = await tx.payment.groupBy({
        by: ['type', 'status'],
        where: { createdAt },
        _sum: { amount: true },
        _count: { _all: true },
      });
      return {
        range: { from, to },
        breakdown: rows.map((r) => ({
          type: r.type,
          status: r.status,
          count: r._count._all,
          amount: this.amount(r._sum.amount),
        })),
      };
    });
  }

  async drivers(tenantId: string, dto: AnalyticsRangeDto) {
    const { from, to } = this.resolveRange(dto);

    return this.prisma.withTenant(tenantId, async (tx) => {
      const rows = await tx.payment.groupBy({
        by: ['collectedByDriverId'],
        where: {
          type: PaymentType.COD,
          status: { in: [PaymentStatus.COLLECTED, PaymentStatus.REMITTED] },
          collectedByDriverId: { not: null },
          collectedAt: { gte: from, lte: to },
        },
        _sum: { amount: true },
        _count: { _all: true },
      });

      const driverIds = rows
        .map((r) => r.collectedByDriverId)
        .filter((id): id is string => id !== null);
      const drivers = await tx.driver.findMany({
        where: { id: { in: driverIds } },
        select: { id: true, name: true },
      });
      const nameById = new Map(drivers.map((d) => [d.id, d.name]));

      return {
        range: { from, to },
        drivers: rows.map((r) => ({
          driverId: r.collectedByDriverId,
          name: nameById.get(r.collectedByDriverId!) ?? null,
          codCount: r._count._all,
          codAmount: this.amount(r._sum.amount),
        })),
      };
    });
  }

  /**
   * El tablero de operación (§6 del plan): dónde está todo AHORA y qué necesita
   * que alguien lo mire.
   *
   * **No lleva rango de fechas, y no es un olvido.** Es la diferencia con
   * `overview`, que responde «cómo nos fue» sobre un período. Esto responde «qué
   * está pasando», y a esa pregunta un rango sólo le puede hacer daño: un bulto
   * que lleva parado en aduana desde marzo es exactamente el que hay que ver, y
   * cualquier ventana de tiempo razonable lo escondería.
   *
   * **Se cuenta sobre `Warehouse` y `Exception`, no sobre estados.** Contar
   * estados dice cuántos envíos hay en cada casilla del enum; no dice en qué
   * bodega física está la carga ni qué está atascado. Por eso esas dos piezas se
   * adelantaron a fases tempranas.
   */
  async operacion(tenantId: string) {
    // La carga que está en alguna bodega nuestra: recibida o ya consolidada
    // pero todavía sin salir. `PRE_ALERTED` no entra —es un paquete que el
    // cliente anunció y que nadie ha visto— y `SHIPPED` tampoco, porque ya no
    // está aquí.
    const enBodega: PackageStatus[] = [
      PackageStatus.RECEIVED,
      PackageStatus.CONSOLIDATED,
    ];
    const excepcionesVivas: ExceptionStatus[] = [
      ExceptionStatus.OPEN,
      ExceptionStatus.INVESTIGATING,
    ];
    const hace30Dias = new Date(Date.now() - 30 * DAY_MS);

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [
        porBodega,
        sinBodega,
        aduana,
        porSeveridad,
        porTipo,
        sinAsignar,
        porEstado,
        exitosos,
      ] = await Promise.all([
        tx.lockerPackage.groupBy({
          by: ['warehouseId'],
          where: { status: { in: enBodega }, warehouseId: { not: null } },
          _count: { _all: true },
        }),
        // Los que están en bodega pero no dicen en cuál. Se enseña a propósito:
        // la recepción todavía no pregunta la bodega (pendiente declarado de la
        // fase 2), así que sin esta cifra el tablero mostraría bodegas vacías y
        // parecería que no hay carga, cuando lo que pasa es que nadie la ubicó.
        tx.lockerPackage.count({
          where: { status: { in: enBodega }, warehouseId: null },
        }),
        tx.customsRecord.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        tx.exception.groupBy({
          by: ['severity'],
          where: { status: { in: excepcionesVivas } },
          _count: { _all: true },
        }),
        tx.exception.groupBy({
          by: ['type'],
          where: { status: { in: excepcionesVivas } },
          _count: { _all: true },
        }),
        // Una excepción abierta que nadie tiene asignada es la que se queda sin
        // resolver. Es la cifra que convierte la bandeja en trabajo repartido.
        tx.exception.count({
          where: { status: { in: excepcionesVivas }, assignedToUserId: null },
        }),
        tx.shipment.groupBy({
          by: ['status'],
          where: {
            status: {
              in: [
                ShipmentStatus.IN_WAREHOUSE_HN,
                ShipmentStatus.OUT_FOR_DELIVERY,
                ShipmentStatus.FAILED_ATTEMPT,
                ShipmentStatus.ON_HOLD_CUSTOMS,
                ShipmentStatus.IN_TRANSIT,
                ShipmentStatus.IN_TRANSIT_INTL,
              ],
            },
          },
          _count: { _all: true },
        }),
        tx.deliveryAttempt.groupBy({
          by: ['attemptNumber'],
          where: {
            outcome: DeliveryOutcome.SUCCESS,
            attemptedAt: { gte: hace30Dias },
          },
          _count: { _all: true },
        }),
      ]);

      const ids = porBodega
        .map((f) => f.warehouseId)
        .filter((id): id is string => id !== null);
      const bodegas = await tx.warehouse.findMany({
        where: { id: { in: ids } },
        select: { id: true, code: true, name: true, country: true },
      });
      const porId = new Map(bodegas.map((b) => [b.id, b]));

      const enAduana = (estado: CustomsStatus) =>
        aduana.find((f) => f.status === estado)?._count._all ?? 0;
      const envios = (estado: ShipmentStatus) =>
        porEstado.find((f) => f.status === estado)?._count._all ?? 0;

      const entregas30 = exitosos.reduce((t, f) => t + f._count._all, 0);
      const alPrimero =
        exitosos.find((f) => f.attemptNumber === 1)?._count._all ?? 0;

      return {
        generadoEn: new Date(),
        bodegas: {
          detalle: porBodega
            .map((f) => ({
              warehouseId: f.warehouseId,
              code: porId.get(f.warehouseId!)?.code ?? null,
              name: porId.get(f.warehouseId!)?.name ?? null,
              country: porId.get(f.warehouseId!)?.country ?? null,
              bultos: f._count._all,
            }))
            .sort((a, b) => b.bultos - a.bultos),
          sinUbicar: sinBodega,
        },
        aduana: {
          pendientes: enAduana(CustomsStatus.PENDING),
          enRevision: enAduana(CustomsStatus.IN_REVIEW),
          // El número que de verdad se mira: lo retenido es lo que no avanza y
          // lo que le cuesta dinero a alguien cada día que pasa.
          retenidos: enAduana(CustomsStatus.ON_HOLD),
          liberados: enAduana(CustomsStatus.CLEARED),
          rechazados: enAduana(CustomsStatus.REJECTED),
        },
        excepciones: {
          abiertas: porSeveridad.reduce((t, f) => t + f._count._all, 0),
          sinAsignar,
          porSeveridad: porSeveridad.map((f) => ({
            severidad: f.severity,
            cuantas: f._count._all,
          })),
          porTipo: porTipo
            .map((f) => ({ tipo: f.type, cuantas: f._count._all }))
            .sort((a, b) => b.cuantas - a.cuantas),
        },
        ultimaMilla: {
          enRuta: envios(ShipmentStatus.OUT_FOR_DELIVERY),
          // Envíos que volvieron a bodega tras un intento fallido. Es la cola
          // que más fácil se queda olvidada: nadie la pide y no vence.
          porReintentar: envios(ShipmentStatus.FAILED_ATTEMPT),
          enBodega: envios(ShipmentStatus.IN_WAREHOUSE_HN),
          enTransito:
            envios(ShipmentStatus.IN_TRANSIT) +
            envios(ShipmentStatus.IN_TRANSIT_INTL),
          // Contexto, no foto del ahora: una tasa calculada sobre las entregas
          // de hoy salta del 0% al 100% con dos paquetes y no significa nada.
          tasaPrimerIntento30Dias:
            entregas30 > 0
              ? Math.round((alPrimero / entregas30) * 1000) / 10
              : null,
          entregas30Dias: entregas30,
        },
      };
    });
  }

  /**
   * Entregas al primer intento, que es el KPI que mide de verdad la última
   * milla.
   *
   * **Por qué el denominador son las entregas y no los envíos.** Un envío que
   * todavía está en camino no ha fallado: contarlo bajaría el porcentaje por
   * ser reciente, no por ir mal, y el número empeoraría cada vez que entra
   * trabajo nuevo. Aquí sólo entran los que YA se entregaron, y de esos se
   * pregunta en cuántas visitas se logró.
   *
   * **El reparto por número de intento va entero y no sólo el «1».** Saber que
   * se entrega al primer intento el 70% no dice si el 30% restante son segundos
   * intentos o cuartos, y no es lo mismo: lo primero es normal, lo segundo es
   * una dirección que nadie está corrigiendo.
   *
   * El desglose de motivos sale de los intentos FALLIDOS del período, no de los
   * envíos entregados: son dos preguntas distintas —cuánto cuesta entregar y
   * por qué se falla— y cruzarlas dejaría fuera los fallos de los envíos que
   * todavía no se han entregado, que son justo los problemáticos.
   */
  async entregas(tenantId: string, dto: AnalyticsRangeDto) {
    const { from, to } = this.resolveRange(dto);
    const attemptedAt = { gte: from, lte: to };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [exitosos, fallidos] = await Promise.all([
        tx.deliveryAttempt.groupBy({
          by: ['attemptNumber'],
          where: { outcome: DeliveryOutcome.SUCCESS, attemptedAt },
          _count: { _all: true },
          orderBy: { attemptNumber: 'asc' },
        }),
        tx.deliveryAttempt.groupBy({
          by: ['failureReason'],
          where: { outcome: DeliveryOutcome.FAILED, attemptedAt },
          _count: { _all: true },
        }),
      ]);

      const entregas = exitosos.reduce((total, f) => total + f._count._all, 0);
      const alPrimero =
        exitosos.find((f) => f.attemptNumber === 1)?._count._all ?? 0;

      return {
        range: { from, to },
        entregas,
        alPrimerIntento: alPrimero,
        // Nulo y no 0 cuando no hubo ninguna entrega: un 0% invita a leer que
        // se entregó mal, cuando lo que pasa es que no se entregó nada y la
        // pregunta no tiene respuesta todavía.
        tasaPrimerIntento:
          entregas > 0 ? Math.round((alPrimero / entregas) * 1000) / 10 : null,
        porNumeroDeIntento: exitosos.map((f) => ({
          intento: f.attemptNumber,
          entregas: f._count._all,
        })),
        fallosPorMotivo: fallidos
          .map((f) => ({
            motivo: f.failureReason,
            intentos: f._count._all,
          }))
          .sort((a, b) => b.intentos - a.intentos),
      };
    });
  }
}
