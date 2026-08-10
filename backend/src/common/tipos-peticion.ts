import type { TenantModule } from '@prisma/client';
import type { AuthUser } from './decorators/current-user.decorator';

/**
 * Forma de la petición tal como la ven los guards.
 *
 * `context.switchToHttp().getRequest()` devuelve `any`, así que sin este tipo
 * cada guard accede a `.user` y `.headers` a ciegas y el linter lo marca. Peor
 * que el aviso es lo que esconde: un fallo de nombre en una propiedad de la
 * que depende un control de acceso no lo detecta nadie hasta producción.
 */
export interface PeticionHttp {
  user?: AuthUser;
  /**
   * Módulos que la empresa tiene activos, puestos por `TenantAccessGuard`.
   *
   * Existe para lo que es transversal a varios módulos y no puede llevar un
   * `@Modulo` propio —el buscador global es el caso—: en vez de estar dentro o
   * fuera del plan entero, mira esta lista y sirve solo lo que corresponda.
   *
   * `undefined` cuando el guard no llegó a resolverla (llave de API o tenant
   * sin fila). Quien la use debe tratarlo como "no filtrar".
   */
  modulosActivos?: TenantModule[];
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  url?: string;
  route?: { path?: string };
  socket?: { remoteAddress?: string };
}

/** Lo que los guards necesitan de la respuesta: poner cabeceras de cupo. */
export interface RespuestaHttp {
  setHeader(nombre: string, valor: string | number): void;
}
