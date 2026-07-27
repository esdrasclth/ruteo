import { Injectable } from '@nestjs/common';
import {
  NotificationStatus,
  PaymentStatus,
  PaymentType,
  Prisma,
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
        tx.$queryRaw<{ day: Date; count: bigint }[]>`
          SELECT date_trunc('day', created_at) AS day, COUNT(*) AS count
          FROM shipments
          WHERE created_at >= ${from} AND created_at <= ${to}
          GROUP BY day
          ORDER BY day ASC`,
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
}
