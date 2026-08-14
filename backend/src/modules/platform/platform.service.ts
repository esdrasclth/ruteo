import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Plan, TenantModule, TenantStatus, UserStatus } from '@prisma/client';
import { claveEstadoTenant } from '../../common/guards/tenant-access.guard';
import { RedisService } from '../../redis/redis.service';
import { StorageService } from '../../storage/storage.service';
import { ZitadelService } from '../auth/zitadel/zitadel.service';
import { PLANS } from '../billing/plans';
import {
  ESENCIALES,
  MODULOS,
  MODULOS_POR_PLAN,
  modulosEfectivos,
} from './modules.catalog';
import { PlatformPrismaService } from './platform-prisma.service';

function inicioDeMes(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function finDeMes(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** Quien ejecuta la accion, para el registro. */
export interface Actor {
  id: string;
  email: string;
  ip?: string;
}

// Gestión de la plataforma: empresas, planes, estado y módulos.
//
// Todo lo de aquí lee y escribe SIN filtro de tenant. Cada método deja rastro
// en el log con quién lo hizo: es la única superficie del sistema que cruza
// empresas y, si algún día hay que responder "¿quién suspendió a este cliente?",
// esa respuesta tiene que existir.

@Injectable()
export class PlatformService {
  private readonly log = new Logger(PlatformService.name);

  constructor(
    private readonly db: PlatformPrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
    private readonly zitadel: ZitadelService,
  ) {}

  /**
   * Tira la copia cacheada del estado de una empresa.
   *
   * `TenantAccessGuard` cachea 60 segundos para no consultar la base en cada
   * petición. Sin este borrado, suspender a alguien tardaba hasta un minuto en
   * surtir efecto —y lo mismo un cambio de plan o de módulos—, que es el tipo
   * de retraso que hace dudar de si el botón funcionó y acaba en un segundo
   * clic. Borrar la clave lo vuelve inmediato y no cuesta nada.
   *
   * Si Redis no responde, `del` se lo traga: se vuelve al comportamiento de
   * antes (hasta un minuto de retraso), que es exactamente el peor caso
   * aceptable y no motivo para tumbar la operación del superadmin.
   */
  private async olvidarEstado(tenantId: string): Promise<void> {
    await this.redis.del(claveEstadoTenant(tenantId));
  }

  /**
   * Anota una acción de plataforma.
   *
   * Se escribe en la MISMA operación que el cambio, no después y sin `catch`
   * que se lo trague: si no se puede dejar constancia, la acción no debe darse
   * por hecha. Un panel que cambia cosas y a veces no lo apunta es peor que uno
   * que no apunta nada, porque da confianza infundada.
   */
  private async anotar(entrada: {
    actor: Actor;
    action: string;
    targetType: 'tenant' | 'platform_admin';
    targetId?: string;
    targetLabel?: string;
    before?: unknown;
    after?: unknown;
    reason?: string;
  }) {
    await this.db.platformAuditLog.create({
      data: {
        adminId: entrada.actor.id,
        adminEmail: entrada.actor.email,
        action: entrada.action,
        targetType: entrada.targetType,
        targetId: entrada.targetId,
        targetLabel: entrada.targetLabel,
        before: (entrada.before ?? undefined) as never,
        after: (entrada.after ?? undefined) as never,
        reason: entrada.reason?.trim() || null,
        ip: entrada.actor.ip,
      },
    });
  }

  /** Historial de plataforma, opcionalmente acotado a una empresa. */
  async historial(targetId?: string, limite = 100) {
    return this.db.platformAuditLog.findMany({
      where: targetId ? { targetId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limite, 300),
    });
  }

  /** Resumen de la plataforma para la pantalla de inicio. */
  async resumen() {
    const [total, porEstado, porPlan, enviosTotales] = await Promise.all([
      this.db.tenant.count(),
      this.db.tenant.groupBy({ by: ['status'], _count: true }),
      this.db.tenant.groupBy({ by: ['plan'], _count: true }),
      this.db.shipment.count(),
    ]);

    return {
      tenants: total,
      envios: enviosTotales,
      porEstado: Object.fromEntries(
        porEstado.map((e) => [e.status, e._count]),
      ) as Record<TenantStatus, number>,
      porPlan: Object.fromEntries(
        porPlan.map((p) => [p.plan, p._count]),
      ) as Record<Plan, number>,
    };
  }

  /** Lista de empresas con lo que se necesita para decidir de un vistazo. */
  async listarTenants(busqueda?: string) {
    const tenants = await this.db.tenant.findMany({
      where: busqueda
        ? {
            OR: [
              { name: { contains: busqueda, mode: 'insensitive' } },
              { slug: { contains: busqueda, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        status: true,
        statusReason: true,
        createdAt: true,
        _count: { select: { users: true, shipments: true } },
      },
    });

    return tenants.map((t) => ({
      ...t,
      usuarios: t._count.users,
      envios: t._count.shipments,
      _count: undefined,
    }));
  }

  /** Ficha completa de una empresa. */
  async detalleTenant(id: string) {
    const tenant = await this.db.tenant.findUnique({
      where: { id },
      include: {
        moduleOverrides: true,
        subscription: true,
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
            emailVerified: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: {
            shipments: true,
            customers: true,
            drivers: true,
            routes: true,
          },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Empresa no encontrada');

    const efectivos = modulosEfectivos(tenant.plan, tenant.moduleOverrides);
    const delPlan = new Set(MODULOS_POR_PLAN[tenant.plan]);

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      status: tenant.status,
      statusReason: tenant.statusReason,
      statusAt: tenant.statusAt,
      createdAt: tenant.createdAt,
      planInfo: PLANS[tenant.plan],
      subscription: tenant.subscription,
      usuarios: tenant.users,
      uso: tenant._count,
      // Se devuelve el catálogo entero con su estado para que el panel pinte
      // conmutadores sin tener que replicar la tabla de planes en el frontend.
      modulos: MODULOS.map((m) => ({
        ...m,
        activo: efectivos.includes(m.key),
        incluidoEnPlan: delPlan.has(m.key),
        excepcion:
          tenant.moduleOverrides.find((o) => o.module === m.key) ?? null,
      })),
    };
  }

  async cambiarPlan(id: string, plan: Plan, actor: Actor) {
    const tenant = await this.db.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Empresa no encontrada');

    await this.db.tenant.update({ where: { id }, data: { plan } });
    await this.anotar({
      actor,
      action: 'tenant.plan_changed',
      targetType: 'tenant',
      targetId: id,
      targetLabel: tenant.slug,
      before: { plan: tenant.plan },
      after: { plan },
    });
    this.log.warn(
      `[plataforma] ${actor.email} cambió el plan de ${tenant.slug}: ${tenant.plan} -> ${plan}`,
    );
    await this.olvidarEstado(id);
    return this.detalleTenant(id);
  }

  /**
   * Suspende o reactiva una empresa.
   *
   * El motivo es obligatorio al suspender: un estado sin explicación obliga a
   * preguntar por chat qué pasó con un cliente, normalmente meses después.
   */
  async cambiarEstado(
    id: string,
    status: TenantStatus,
    motivo: string | undefined,
    actor: Actor,
  ) {
    const tenant = await this.db.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Empresa no encontrada');

    if (status !== TenantStatus.ACTIVE && !motivo?.trim()) {
      throw new BadRequestException(
        'Indica el motivo: sin él, nadie sabrá después por qué se suspendió.',
      );
    }

    await this.db.tenant.update({
      where: { id },
      data: {
        status,
        statusReason: status === TenantStatus.ACTIVE ? null : motivo!.trim(),
        statusAt: new Date(),
      },
    });
    await this.anotar({
      actor,
      action:
        status === TenantStatus.ACTIVE
          ? 'tenant.reactivated'
          : 'tenant.suspended',
      targetType: 'tenant',
      targetId: id,
      targetLabel: tenant.slug,
      before: { status: tenant.status, reason: tenant.statusReason },
      after: { status },
      reason: motivo,
    });
    this.log.warn(
      `[plataforma] ${actor.email} puso ${tenant.slug} en ${status}` +
        (motivo ? ` — ${motivo}` : ''),
    );
    await this.olvidarEstado(id);
    return this.detalleTenant(id);
  }

  /** Activa o desactiva un módulo para una empresa concreta. */
  async cambiarModulo(
    id: string,
    module: TenantModule,
    enabled: boolean,
    motivo: string | undefined,
    actor: Actor,
  ) {
    const tenant = await this.db.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Empresa no encontrada');

    if (!enabled && ESENCIALES.has(module)) {
      throw new BadRequestException(
        'Ese módulo es esencial: apagarlo dejaría el panel sin sentido.',
      );
    }

    const vieneEnPlan = MODULOS_POR_PLAN[tenant.plan].includes(module);
    if (vieneEnPlan === enabled) {
      // Coincide con el plan: se borra la excepción en vez de guardar una fila
      // redundante. Así, al cambiar de plan, el tenant hereda lo nuevo.
      await this.db.tenantModuleOverride.deleteMany({
        where: { tenantId: id, module },
      });
    } else {
      await this.db.tenantModuleOverride.upsert({
        where: { tenantId_module: { tenantId: id, module } },
        create: { tenantId: id, module, enabled, reason: motivo?.trim() },
        update: { enabled, reason: motivo?.trim() },
      });
    }

    await this.anotar({
      actor,
      action: enabled ? 'tenant.module_enabled' : 'tenant.module_disabled',
      targetType: 'tenant',
      targetId: id,
      targetLabel: tenant.slug,
      after: { module, enabled },
      reason: motivo,
    });
    this.log.warn(
      `[plataforma] ${actor.email} ${enabled ? 'activó' : 'desactivó'} ${module} en ${tenant.slug}` +
        (motivo ? ` — ${motivo}` : ''),
    );
    await this.olvidarEstado(id);
    return this.detalleTenant(id);
  }

  // --- 1. Busqueda global ----------------------------------------------------

  /**
   * Busca en TODAS las empresas a la vez.
   *
   * Existe por una llamada concreta que soporte recibe a diario: "mi guia
   * RUT-XXXX no aparece". Sin esto hay que ir a la base a mano, porque el panel
   * de cada empresa solo ve lo suyo.
   *
   * Devuelve lo justo para identificar y saltar a la ficha; nunca el contenido
   * del envio. Este panel sirve para administrar, no para leer los datos de los
   * clientes.
   */
  async buscar(q: string) {
    const texto = q.trim();
    if (texto.length < 3) {
      throw new BadRequestException('Escribe al menos 3 caracteres.');
    }
    const contiene = { contains: texto, mode: 'insensitive' as const };

    const [empresas, envios, clientes, usuarios] = await Promise.all([
      this.db.tenant.findMany({
        where: { OR: [{ name: contiene }, { slug: contiene }] },
        select: { id: true, name: true, slug: true, status: true },
        take: 10,
      }),
      this.db.shipment.findMany({
        where: { trackingNumber: contiene },
        select: {
          id: true,
          trackingNumber: true,
          status: true,
          createdAt: true,
          tenant: { select: { id: true, name: true, slug: true } },
        },
        take: 10,
      }),
      this.db.customer.findMany({
        where: { OR: [{ name: contiene }, { email: contiene }] },
        select: {
          id: true,
          name: true,
          email: true,
          tenant: { select: { id: true, name: true, slug: true } },
        },
        take: 10,
      }),
      this.db.user.findMany({
        where: { email: contiene },
        select: {
          id: true,
          email: true,
          role: true,
          tenant: { select: { id: true, name: true, slug: true } },
        },
        take: 10,
      }),
    ]);

    return { empresas, envios, clientes, usuarios };
  }

  // --- 2. Salud operativa ----------------------------------------------------

  /**
   * Lo que esta fallando ahora mismo, agregado por empresa.
   *
   * El valor esta en enterarse ANTES de que llamen: si a un cliente no le
   * llegan los avisos o sus webhooks rebotan, aqui se ve sin que nadie lo
   * reporte.
   */
  async salud() {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [notiFallidas, notiPendientes, webhookFallidos, porEmpresa] =
      await Promise.all([
        this.db.notification.count({
          where: { status: 'FAILED', createdAt: { gte: desde } },
        }),
        this.db.notification.count({ where: { status: 'PENDING' } }),
        this.db.webhookDelivery.count({
          where: { status: 'FAILED', createdAt: { gte: desde } },
        }),
        this.db.notification.groupBy({
          by: ['tenantId'],
          where: { status: 'FAILED', createdAt: { gte: desde } },
          _count: true,
        }),
      ]);

    // Se resuelven los nombres aparte: `groupBy` no admite `include`.
    const tenants = await this.db.tenant.findMany({
      where: { id: { in: porEmpresa.map((x) => x.tenantId) } },
      select: { id: true, name: true, slug: true },
    });
    const porNombre = new Map(tenants.map((t) => [t.id, t]));

    return {
      ventanaHoras: 24,
      notificacionesFallidas: notiFallidas,
      notificacionesPendientes: notiPendientes,
      webhooksFallidos: webhookFallidos,
      empresasConFallos: porEmpresa
        .map((x) => ({
          tenant: porNombre.get(x.tenantId) ?? null,
          fallos: x._count,
        }))
        .filter((e) => e.tenant)
        .sort((a, b) => b.fallos - a.fallos),
    };
  }

  // --- 3. Uso contra el limite del plan --------------------------------------

  /**
   * Cuanto ha consumido cada empresa de su cupo.
   *
   * Sirve para dos cosas a la vez: ver quien esta a punto de necesitar un plan
   * mayor —eso es la proxima venta— y comprobar que nadie se este pasando de lo
   * que paga.
   *
   * El periodo se toma de la suscripcion si existe, igual que `billing`: si
   * aqui se usara el mes natural, el panel diria un numero y el cliente veria
   * otro en el suyo.
   */
  async usoDePlanes() {
    const tenants = await this.db.tenant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        status: true,
        subscription: {
          select: { currentPeriodStart: true, currentPeriodEnd: true },
        },
      },
    });

    const filas = await Promise.all(
      tenants.map(async (t) => {
        const inicio =
          t.subscription?.currentPeriodStart ?? inicioDeMes(new Date());
        const fin = t.subscription?.currentPeriodEnd ?? finDeMes(new Date());
        const usados = await this.db.shipment.count({
          where: { tenantId: t.id, createdAt: { gte: inicio, lte: fin } },
        });
        const limite = PLANS[t.plan].shipmentLimit;
        return {
          id: t.id,
          name: t.name,
          slug: t.slug,
          plan: t.plan,
          status: t.status,
          limite,
          usados,
          // `null` = ilimitado. Va aparte del porcentaje para que el panel no
          // tenga que interpretar un 0 como "sin datos".
          porcentaje:
            limite == null ? null : Math.round((usados / limite) * 100),
          periodo: { inicio, fin },
        };
      }),
    );

    // Los mas apretados primero: es donde hay que mirar.
    return filas.sort((a, b) => (b.porcentaje ?? -1) - (a.porcentaje ?? -1));
  }

  // --- 4. Ingresos -----------------------------------------------------------

  /**
   * Ingreso recurrente mensual, por plan.
   *
   * Se calcula desde las SUSCRIPCIONES activas y no desde el plan del tenant:
   * una empresa puede tener plan PRO con la suscripcion cancelada, y contarla
   * como ingreso seria contar dinero que no entra.
   */
  async ingresos() {
    const suscripciones = await this.db.subscription.findMany({
      where: { status: 'ACTIVE' },
      select: { plan: true, amount: true, currency: true },
    });

    const porPlan = new Map<Plan, { cuentas: number; monto: number }>();
    for (const sub of suscripciones) {
      const actual = porPlan.get(sub.plan) ?? { cuentas: 0, monto: 0 };
      actual.cuentas += 1;
      actual.monto += Number(sub.amount);
      porPlan.set(sub.plan, actual);
    }

    const mrr = [...porPlan.values()].reduce((a, b) => a + b.monto, 0);
    const gratuitas = await this.db.tenant.count({
      where: { plan: Plan.FREE, status: TenantStatus.ACTIVE },
    });

    return {
      // La moneda sale de las propias suscripciones. Hoy todas van en la misma;
      // si algun dia no, esto hay que separarlo por moneda en vez de sumar
      // peras con manzanas.
      moneda: suscripciones[0]?.currency ?? 'HNL',
      mrr,
      porPlan: [...porPlan.entries()].map(([plan, v]) => ({ plan, ...v })),
      empresasEnPlanGratuito: gratuitas,
    };
  }

  /** Los superadmins de la plataforma. */
  async listarAdmins() {
    return this.db.platformAdmin.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  }

  /**
   * Borra una empresa y absolutamente todo lo suyo. No se puede deshacer.
   *
   * **El orden de las operaciones es la parte delicada**, porque tres sistemas
   * distintos guardan datos de la misma empresa y solo uno tiene transacciones:
   *
   *  1. Se recuentan las filas ANTES de borrar. Después no hay a quién
   *     preguntarle cuánto se destruyó, y «se borró la empresa» sin cifras no
   *     sirve para responderle a nadie que reclame más adelante.
   *  2. Se leen los `externalId` de ZITADEL antes también: viven en la tabla de
   *     usuarios, que el cascade se lleva por delante. Después de borrar ya no
   *     se sabe qué cuentas dejar huérfanas.
   *  3. **El apunte del registro y el borrado van en la MISMA transacción.** Si
   *     el apunte falla, no se borra nada; si el borrado falla, no queda un
   *     apunte de algo que no pasó. Un borrado irreversible sin constancia es
   *     exactamente lo que nadie puede permitirse explicar después.
   *  4. Archivos y cuentas de ZITADEL se limpian DESPUÉS y sin poder tumbar la
   *     operación. No es descuido: a esas alturas la empresa ya no existe en la
   *     base y no hay marcha atrás, así que fallar aquí no puede revertir nada.
   *     Lo que queda son archivos huérfanos —cuestan dinero, no corrompen— y se
   *     devuelven contados para que alguien pueda rematarlo a mano.
   *
   * El borrado en la base no enumera tablas: las relaciones a `Tenant` llevan
   * `onDelete: Cascade`, así que una sola sentencia arrastra todo. Enumerarlas
   * habría creado una lista que hay que acordarse de ampliar con cada tabla
   * nueva, y la que se olvide deja filas huérfanas sin que nadie lo note.
   */
  async borrarTenant(
    id: string,
    slugConfirmado: string,
    motivo: string,
    actor: Actor,
  ) {
    const tenant = await this.db.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Empresa no encontrada');

    // La confirmación se compara contra el slug de ESTA empresa. Sin esto, el
    // borrado se lanza desde una lista de nombres parecidos y basta una fila de
    // diferencia para destruir la empresa equivocada.
    if (slugConfirmado.trim() !== tenant.slug) {
      throw new BadRequestException(
        `El identificador no coincide. Escribe «${tenant.slug}» para confirmar.`,
      );
    }

    const [usuarios, envios, paquetes, pagos] = await Promise.all([
      this.db.user.findMany({
        where: { tenantId: id },
        select: { id: true, email: true, externalId: true },
      }),
      this.db.shipment.count({ where: { tenantId: id } }),
      this.db.lockerPackage.count({ where: { tenantId: id } }),
      this.db.payment.count({ where: { tenantId: id } }),
    ]);

    const destruido = {
      usuarios: usuarios.length,
      envios,
      paquetes,
      pagos,
    };

    await this.db.$transaction([
      this.db.platformAuditLog.create({
        data: {
          adminId: actor.id,
          adminEmail: actor.email,
          action: 'tenant.deleted',
          targetType: 'tenant',
          targetId: id,
          targetLabel: tenant.slug,
          // El «antes» guarda la ficha entera. Es lo único que quedará de esta
          // empresa: sin ella, el registro diría que se borró algo sin decir
          // qué era, con qué plan ni desde cuándo existía.
          before: {
            nombre: tenant.name,
            slug: tenant.slug,
            plan: tenant.plan,
            status: tenant.status,
            creada: tenant.createdAt,
            destruido,
          } as never,
          reason: motivo.trim(),
          ip: actor.ip,
        },
      }),
      this.db.tenant.delete({ where: { id } }),
    ]);

    this.log.warn(
      `[plataforma] ${actor.email} BORRÓ la empresa ${tenant.slug} — ` +
        `${destruido.envios} envíos, ${destruido.paquetes} bultos, ` +
        `${destruido.pagos} pagos, ${destruido.usuarios} usuarios — ${motivo.trim()}`,
    );

    const restos = await this.limpiarFuera(id, usuarios);
    await this.olvidarEstado(id);

    return { borrada: tenant.slug, destruido, ...restos };
  }

  /**
   * Lo que vive fuera de Postgres: archivos y cuentas de ZITADEL.
   *
   * Nada de esto puede lanzar. La empresa ya está borrada cuando se llega aquí,
   * así que un error no revierte nada y propagarlo solo convertiría un borrado
   * correcto en un 500 que hace pensar que hay que reintentar —y al reintentar,
   * la empresa ya no existe—. Se devuelve lo que salió mal para que se vea en
   * la respuesta y quede en el log.
   */
  private async limpiarFuera(
    tenantId: string,
    usuarios: { id: string; email: string; externalId: string | null }[],
  ) {
    let archivos = 0;
    const problemas: string[] = [];

    try {
      archivos = await this.storage.borrarTodoDelTenant(tenantId);
    } catch (e) {
      const detalle = e instanceof Error ? e.message : String(e);
      problemas.push(`archivos: ${detalle}`);
      this.log.error(
        `[plataforma] quedaron archivos sin borrar de ${tenantId}: ${detalle}`,
      );
    }

    // Las credenciales viven en ZITADEL, no aquí: el cascade borra la fila de
    // `users` pero no la cuenta. Sin esto, quien fue usuario de una empresa
    // borrada sigue pudiendo autenticarse contra ZITADEL — no entraría a
    // ningún sitio, porque no queda tenant, pero la cuenta sobrevive al cliente
    // que pidió la baja, y eso es lo que se promete al borrar.
    let cuentas = 0;
    for (const usuario of usuarios) {
      if (!usuario.externalId) continue;
      try {
        await this.zitadel.borrarUsuario(usuario.externalId);
        cuentas++;
      } catch (e) {
        const detalle = e instanceof Error ? e.message : String(e);
        problemas.push(`cuenta ${usuario.email}: ${detalle}`);
        this.log.error(
          `[plataforma] no se pudo borrar la cuenta ${usuario.email}: ${detalle}`,
        );
      }
    }

    return { archivos, cuentas, problemas };
  }

  async cambiarEstadoAdmin(id: string, status: UserStatus, actor: Actor) {
    const admin = await this.db.platformAdmin.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException('Administrador no encontrado');

    if (admin.id === actor.id && status !== UserStatus.ACTIVE) {
      // Sin esto, el último superadmin puede dejarse fuera y ya nadie entra al
      // panel: habría que arreglarlo a mano en la base.
      throw new BadRequestException('No puedes desactivar tu propia cuenta.');
    }

    await this.db.platformAdmin.update({ where: { id }, data: { status } });
    await this.anotar({
      actor,
      action: status === UserStatus.ACTIVE ? 'admin.enabled' : 'admin.disabled',
      targetType: 'platform_admin',
      targetId: id,
      targetLabel: admin.email,
      before: { status: admin.status },
      after: { status },
    });
    this.log.warn(
      `[plataforma] ${actor.email} puso ${admin.email} en ${status}`,
    );
    return this.listarAdmins();
  }
}
