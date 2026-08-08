import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantModule, TenantStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { modulosEfectivos } from '../../modules/platform/modules.catalog';
import { MODULO_KEY } from '../decorators/modulo.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';

interface EstadoTenant {
  status: TenantStatus;
  reason: string | null;
  modulos: TenantModule[];
}

// Cuánto se cachea el estado. Es el compromiso entre no golpear la base en cada
// petición y que una suspensión tarde en surtir efecto. Un minuto acota el
// retraso a algo que se puede explicar por teléfono.
const CACHE_S = 60;

/**
 * Corta el paso si la empresa está suspendida o si el módulo pedido está
 * desactivado.
 *
 * Antes de esto, `Tenant.status` existía en el esquema pero **no se aplicaba en
 * ningún sitio**: una empresa suspendida entraba y operaba igual, así que el
 * botón de suspender del panel de plataforma habría sido decorativo.
 */
@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;
    if (!user?.tenantId) return true;

    const estado = await this.estadoDe(user.tenantId);
    if (!estado) return true; // sin datos, no se bloquea a nadie

    if (estado.status !== TenantStatus.ACTIVE) {
      throw new ForbiddenException(
        estado.status === TenantStatus.SUSPENDED
          ? `Cuenta suspendida${estado.reason ? `: ${estado.reason}` : ''}. Contacta con soporte.`
          : 'Esta cuenta está cancelada. Contacta con soporte.',
      );
    }

    const requerido = this.reflector.getAllAndOverride<TenantModule>(
      MODULO_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requerido && !estado.modulos.includes(requerido)) {
      throw new ForbiddenException(
        'Este módulo no está incluido en tu plan. Habla con soporte para activarlo.',
      );
    }
    return true;
  }

  private async estadoDe(tenantId: string): Promise<EstadoTenant | null> {
    const key = `tenant:estado:${tenantId}`;
    const cacheado = await this.redis.getJson<EstadoTenant>(key);
    if (cacheado) return cacheado;

    // La lectura va con el contexto del propio tenant, así que sigue pasando
    // por RLS: este guard no es una vía para leer datos de otras empresas.
    const fila = await this.prisma.withTenant(tenantId, (tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: {
          status: true,
          statusReason: true,
          plan: true,
          moduleOverrides: { select: { module: true, enabled: true } },
        },
      }),
    );
    if (!fila) return null;

    const estado: EstadoTenant = {
      status: fila.status,
      reason: fila.statusReason,
      modulos: modulosEfectivos(fila.plan, fila.moduleOverrides),
    };
    await this.redis.setJson(key, estado, CACHE_S);
    return estado;
  }
}
