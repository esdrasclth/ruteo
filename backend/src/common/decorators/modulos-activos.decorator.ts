import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantModule } from '@prisma/client';
import type { PeticionHttp } from '../tipos-peticion';

/**
 * Módulos que la empresa tiene activos, resueltos por `TenantAccessGuard`.
 *
 * Es la alternativa a `@Modulo` para lo transversal. `@Modulo` apaga un
 * controlador entero, que es lo correcto cuando el controlador ES la función;
 * el buscador global, en cambio, tiene que existir en todos los planes y a la
 * vez respetar lo que cada empresa contrató en el detalle de sus resultados.
 *
 * Devuelve `undefined` si el guard no llegó a resolverlos. Quien lo reciba debe
 * tratarlo como "no filtrar": es lo que ya pasaba antes, y fallar hacia el
 * comportamiento anterior es mejor que dejar a alguien sin buscar por un dato
 * que no se pudo leer.
 */
export const ModulosActivos = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantModule[] | undefined =>
    ctx.switchToHttp().getRequest<PeticionHttp>().modulosActivos,
);
