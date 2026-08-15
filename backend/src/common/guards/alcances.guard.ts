import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiScope } from '@prisma/client';
import { ALCANCES_KEY } from '../decorators/alcances.decorator';
import type { PeticionHttp } from '../tipos-peticion';

/**
 * Comprueba el alcance de la llave de API. **Deniega por defecto**, igual que
 * `RolesGuard` y por el mismo motivo: un endpoint alcanzable desde fuera al que
 * nadie le declaró permisos es un fallo, y fallar abierto lo vuelve invisible.
 *
 * No toca las peticiones con sesión de usuario. Una llave no puede hacer más
 * que el rol con el que corre (`MERCHANT`); el alcance sólo resta.
 */
@Injectable()
export class AlcancesGuard implements CanActivate {
  private readonly log = new Logger(AlcancesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<PeticionHttp>().user;

    // Sesión de persona: aquí no se decide nada, ya lo hizo `RolesGuard`.
    if (!user?.llave) return true;

    const requeridos = this.reflector.getAllAndOverride<ApiScope[]>(
      ALCANCES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requeridos || requeridos.length === 0) {
      // Desde fuera esto se ve igual que «te falta permiso», y diagnosticarlo
      // como tal lleva a ampliar los alcances de la llave —que no arregla
      // nada— en vez de a declarar el endpoint.
      this.log.error(
        `${context.getClass().name}.${context.getHandler().name} no declara ` +
          '@Alcances; se deniega a las llaves de API por defecto.',
      );
      throw new ForbiddenException(
        'Esta llave de API no tiene alcance sobre este recurso.',
      );
    }

    const tiene = requeridos.some((a) => user.llave!.alcances.includes(a));
    if (!tiene) {
      throw new ForbiddenException(
        `Esta llave de API no tiene alcance sobre este recurso. Necesita uno de: ${requeridos.join(', ')}.`,
      );
    }
    return true;
  }
}
