import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Plan, Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaymentsService } from '../payments/payments.service';
import { BILLING_PROVIDER } from './billing-provider';
import type { BillingProvider } from './billing-provider';
import { SubscribeDto } from './dto/subscribe.dto';
import { getPlan, PLANS } from './plans';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
  ) {}

  listPlans() {
    return Object.values(PLANS);
  }

  async getSubscription(tenantId: string) {
    const subscription = await this.prisma.withTenant(tenantId, (tx) =>
      tx.subscription.findUnique({ where: { tenantId } }),
    );
    if (!subscription) {
      throw new NotFoundException('No active subscription');
    }
    return subscription;
  }

  async subscribe(actor: AuthUser, dto: SubscribeDto) {
    const { tenantId } = actor;
    const planDef = getPlan(dto.plan);
    const result = await this.provider.startSubscription({
      tenantId,
      plan: planDef,
    });

    const subscription = await this.prisma.withTenant(tenantId, async (tx) => {
      const data = {
        plan: planDef.plan,
        status: result.status,
        provider: this.provider.name,
        providerRef: result.providerRef,
        amount: new Prisma.Decimal(planDef.monthlyAmount),
        currency: planDef.currency,
        currentPeriodStart: result.currentPeriodStart,
        currentPeriodEnd: result.currentPeriodEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      };
      const created = await tx.subscription.upsert({
        where: { tenantId },
        create: { tenantId, ...data },
        update: data,
      });
      await tx.tenant.update({
        where: { id: tenantId },
        data: { plan: planDef.plan },
      });
      if (planDef.monthlyAmount > 0) {
        await this.payments.createSubscriptionInTx(tx, tenantId, {
          amount: planDef.monthlyAmount,
          currency: planDef.currency,
        });
      }
      return created;
    });

    this.audit.dispatch(tenantId, {
      action: 'subscription.changed',
      entityType: 'subscription',
      entityId: subscription.id,
      actor: { userId: actor.userId, role: actor.role },
      metadata: { plan: planDef.plan, status: subscription.status },
    });
    return subscription;
  }

  // Usage vs. the tenant's plan quota for the current billing period. The period
  // comes from the active subscription; tenants without one fall back to the
  // current calendar month (UTC).
  async getUsage(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [tenant, subscription] = await Promise.all([
        tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { plan: true },
        }),
        tx.subscription.findUnique({
          where: { tenantId },
          select: { currentPeriodStart: true, currentPeriodEnd: true },
        }),
      ]);
      const planDef = getPlan(tenant.plan);
      const { start, end } = this.currentPeriod(subscription);
      const shipmentsUsed = await tx.shipment.count({
        where: { createdAt: { gte: start, lte: end } },
      });
      const limit = planDef.shipmentLimit;
      return {
        plan: planDef.plan,
        periodStart: start,
        periodEnd: end,
        shipmentLimit: limit,
        shipmentsUsed,
        shipmentsRemaining: limit == null ? null : Math.max(0, limit - shipmentsUsed),
      };
    });
  }

  // Throws when the tenant has reached its plan's shipment quota for the period.
  async assertShipmentQuota(tenantId: string) {
    const usage = await this.getUsage(tenantId);
    if (
      usage.shipmentLimit != null &&
      usage.shipmentsUsed >= usage.shipmentLimit
    ) {
      throw new ForbiddenException(
        `Límite del plan ${usage.plan} alcanzado (${usage.shipmentLimit} envíos por período). Actualiza tu plan para crear más.`,
      );
    }
  }

  private currentPeriod(
    subscription: { currentPeriodStart: Date; currentPeriodEnd: Date } | null,
  ): { start: Date; end: Date } {
    if (subscription) {
      return {
        start: subscription.currentPeriodStart,
        end: subscription.currentPeriodEnd,
      };
    }
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1,
    );
    return { start, end };
  }

  async cancel(actor: AuthUser, atPeriodEnd: boolean) {
    const { tenantId } = actor;
    const subscription = await this.getSubscription(tenantId);
    const result = await this.provider.cancelSubscription({
      providerRef: subscription.providerRef,
      atPeriodEnd,
    });

    const updated = await this.prisma.withTenant(tenantId, async (tx) => {
      const row = await tx.subscription.update({
        where: { tenantId },
        data: {
          status: result.status,
          cancelAtPeriodEnd: atPeriodEnd,
          canceledAt: result.canceledAt,
        },
      });
      if (!atPeriodEnd) {
        await tx.tenant.update({
          where: { id: tenantId },
          data: { plan: Plan.FREE },
        });
      }
      return row;
    });

    this.audit.dispatch(tenantId, {
      action: 'subscription.canceled',
      entityType: 'subscription',
      entityId: updated.id,
      actor: { userId: actor.userId, role: actor.role },
      metadata: { atPeriodEnd, status: updated.status },
    });
    return updated;
  }
}
