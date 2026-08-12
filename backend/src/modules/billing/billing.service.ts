import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Plan, Prisma, SubscriptionStatus } from '@prisma/client';
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
  private readonly log = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
  ) {}

  listPlans() {
    return Object.values(PLANS);
  }

  /**
   * Cierra las pruebas vencidas y devuelve a FREE a esas empresas.
   *
   * Cruza todos los tenants, así que va por una función SECURITY DEFINER: el rol
   * de la aplicación es NOBYPASSRLS y sin contexto de tenant no vería ni una
   * fila. Mismo patrón que `purgar_idempotencia`.
   *
   * **Esto no es el control de acceso.** El plan efectivo ya lo resuelve
   * `planEfectivo` en cada petición, así que una prueba vencida deja de dar
   * acceso aunque este trabajo no haya corrido. Esto existe para que la base
   * diga la verdad en informes y en el panel de plataforma.
   */
  async caducarPruebas(): Promise<number> {
    const filas = await this.prisma.$queryRaw<{ caducar_pruebas: number }[]>`
      SELECT caducar_pruebas()`;
    const caducadas = filas[0]?.caducar_pruebas ?? 0;
    if (caducadas > 0) {
      this.log.log(
        `Caducadas ${caducadas} pruebas; esas empresas pasan a FREE`,
      );
    }
    return caducadas;
  }

  /** Plan que la empresa tiene ahora mismo, que es contra el que se compara. */
  private async planActual(tenantId: string): Promise<Plan> {
    const tenant = await this.prisma.withTenant(tenantId, (tx) =>
      tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { plan: true },
      }),
    );
    return tenant.plan;
  }

  /**
   * Sin estos datos no se puede emitir una factura a nombre de nadie.
   *
   * El error dice QUÉ falta, uno por uno. Un «faltan datos fiscales» genérico
   * obliga a abrir la pantalla y comparar campo por campo para adivinar cuál.
   */
  private async exigirDatosFiscales(tenantId: string): Promise<void> {
    const tenant = await this.prisma.withTenant(tenantId, (tx) =>
      tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: {
          legalName: true,
          taxId: true,
          billingEmail: true,
          billingAddress: true,
        },
      }),
    );

    const faltan = [
      [tenant.legalName, 'razón social'],
      [tenant.taxId, 'RTN'],
      [tenant.billingEmail, 'correo de facturación'],
      [tenant.billingAddress, 'dirección fiscal'],
    ]
      .filter(([valor]) => !valor)
      .map(([, etiqueta]) => etiqueta as string);

    if (faltan.length > 0) {
      throw new BadRequestException(
        `Para contratar un plan de pago faltan tus datos de facturación: ` +
          `${faltan.join(', ')}. Complétalos en Facturación › Datos fiscales.`,
      );
    }
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

    // **Subir de plan exige que alguien cobre.** Con el proveedor manual —el
    // único que hay hoy— `startSubscription` devuelve ACTIVE sin cobrar nada,
    // así que este endpoint era una promoción gratuita a ENTERPRISE: los
    // catorce módulos y envíos sin tope, con una sola petición y desde
    // cualquier cuenta OWNER o ADMIN. Dejaba en decorativos tanto el `@Modulo`
    // como `assertShipmentQuota`.
    //
    // Se compara por importe y no por posición en el enum: el orden de los
    // planes es el de su precio, y así añadir uno intermedio no obliga a tocar
    // esta comprobación.
    const actual = getPlan(await this.planActual(tenantId));
    if (!this.provider.cobra && planDef.monthlyAmount > actual.monthlyAmount) {
      throw new ForbiddenException(
        `Para pasar al plan ${planDef.name} hay que contratarlo con nosotros: ` +
          'escríbenos y lo activamos. No se puede subir de plan desde aquí.',
      );
    }

    // Los datos fiscales se exigen AQUÍ y no en el alta. Es el mismo criterio
    // que «no liberar de aduana con saldo pendiente»: se pide el dato en el
    // momento en que hace falta, no por si acaso. Nadie necesita un RTN para
    // rastrear un paquete, y meterlo en el registro solo sirve para que menos
    // gente termine el registro.
    if (planDef.monthlyAmount > 0) {
      await this.exigirDatosFiscales(tenantId);
    }

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

      // El plan efectivo del tenant solo avanza si la suscripción quedó viva.
      // Antes se aplicaba pasara lo que pasara con `result.status`, así que una
      // pasarela que devolviera PAST_DUE —pago rechazado— habría concedido el
      // plan igual. Hoy no puede ocurrir porque el proveedor manual siempre
      // responde ACTIVE, pero es el punto exacto donde se colará el fallo el
      // día que se enchufe una pasarela de verdad.
      if (
        result.status === SubscriptionStatus.ACTIVE ||
        result.status === SubscriptionStatus.TRIALING
      ) {
        await tx.tenant.update({
          where: { id: tenantId },
          data: { plan: planDef.plan },
        });
      }
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
        shipmentsRemaining:
          limit == null ? null : Math.max(0, limit - shipmentsUsed),
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
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
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
