import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PaymentStatus,
  PaymentType,
  Prisma,
} from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CollectPaymentDto } from './dto/collect-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Called inside the shipment-creation transaction: opens a pending COD payment
  // when the shipment carries a cash-on-delivery amount.
  createCodInTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    shipment: { id: string; codAmount: Prisma.Decimal | null; currency: string },
  ) {
    if (!shipment.codAmount || shipment.codAmount.lte(0)) {
      return undefined;
    }
    return tx.payment.create({
      data: {
        tenantId,
        shipmentId: shipment.id,
        type: PaymentType.COD,
        amount: shipment.codAmount,
        currency: shipment.currency,
        status: PaymentStatus.PENDING,
      },
    });
  }

  // Called inside the billing transaction: opens a pending SUBSCRIPTION payment
  // for the plan charge (skipped for free plans).
  createSubscriptionInTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: { amount: Prisma.Decimal | number; currency: string },
  ) {
    return tx.payment.create({
      data: {
        tenantId,
        type: PaymentType.SUBSCRIPTION,
        amount: input.amount,
        currency: input.currency,
        status: PaymentStatus.PENDING,
      },
    });
  }

  // Called inside the delivery transaction: marks the shipment's pending COD
  // payments as collected.
  collectForShipmentInTx(
    tx: Prisma.TransactionClient,
    shipmentId: string,
  ) {
    return tx.payment.updateMany({
      where: {
        shipmentId,
        type: PaymentType.COD,
        status: PaymentStatus.PENDING,
      },
      data: { status: PaymentStatus.COLLECTED, collectedAt: new Date() },
    });
  }

  list(
    tenantId: string,
    filters: { status?: PaymentStatus; type?: PaymentType; driverId?: string },
  ) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.payment.findMany({
        where: {
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.type ? { type: filters.type } : {}),
          ...(filters.driverId
            ? { collectedByDriverId: filters.driverId }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          shipment: { select: { trackingNumber: true, recipientName: true } },
        },
      }),
    );
  }

  async findOne(tenantId: string, id: string) {
    const payment = await this.prisma.withTenant(tenantId, (tx) =>
      tx.payment.findUnique({
        where: { id },
        include: {
          shipment: { select: { trackingNumber: true, recipientName: true } },
        },
      }),
    );
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return payment;
  }

  async collect(actor: AuthUser, id: string, dto: CollectPaymentDto) {
    const { tenantId } = actor;
    const payment = await this.findOne(tenantId, id);
    if (payment.status === PaymentStatus.REMITTED) {
      throw new BadRequestException('Payment already remitted');
    }
    if (dto.collectedByDriverId) {
      const driver = await this.prisma.withTenant(tenantId, (tx) =>
        tx.driver.findUnique({
          where: { id: dto.collectedByDriverId },
          select: { id: true },
        }),
      );
      if (!driver) {
        throw new BadRequestException('Driver not found');
      }
    }
    const updated = await this.prisma.withTenant(tenantId, (tx) =>
      tx.payment.update({
        where: { id },
        data: {
          status: PaymentStatus.COLLECTED,
          collectedAt: payment.collectedAt ?? new Date(),
          method: dto.method,
          reference: dto.reference,
          collectedByDriverId: dto.collectedByDriverId,
        },
      }),
    );
    this.audit.dispatch(tenantId, {
      action: 'payment.collected',
      entityType: 'payment',
      entityId: id,
      actor: { userId: actor.userId, role: actor.role },
      metadata: {
        amount: updated.amount.toString(),
        currency: updated.currency,
        method: dto.method ?? null,
      },
    });
    return updated;
  }

  async remit(actor: AuthUser, id: string) {
    const { tenantId } = actor;
    const payment = await this.findOne(tenantId, id);
    if (payment.status !== PaymentStatus.COLLECTED) {
      throw new BadRequestException(
        'Only collected payments can be remitted',
      );
    }
    const updated = await this.prisma.withTenant(tenantId, (tx) =>
      tx.payment.update({
        where: { id },
        data: { status: PaymentStatus.REMITTED, remittedAt: new Date() },
      }),
    );
    this.audit.dispatch(tenantId, {
      action: 'payment.remitted',
      entityType: 'payment',
      entityId: id,
      actor: { userId: actor.userId, role: actor.role },
      metadata: {
        amount: updated.amount.toString(),
        currency: updated.currency,
      },
    });
    return updated;
  }

  // Totals grouped by status, useful for COD reconciliation dashboards.
  async summary(tenantId: string) {
    const rows = await this.prisma.withTenant(tenantId, (tx) =>
      tx.payment.groupBy({
        by: ['status'],
        where: { type: PaymentType.COD },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    );
    return rows.map((r) => ({
      status: r.status,
      count: r._count._all,
      amount: r._sum.amount ?? new Prisma.Decimal(0),
    }));
  }
}
