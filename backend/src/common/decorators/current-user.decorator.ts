import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiScope, Role } from '@prisma/client';

export interface AuthUser {
  userId: string | null;
  tenantId: string;
  role: Role;
  /**
   * Presente **solo** cuando la petición se autenticó con una llave de API.
   *
   * Su ausencia es lo que distingue a una persona con sesión de una integración
   * externa, y de eso depende `AlcancesGuard`: los alcances acotan a la llave,
   * no al usuario. Sin esta marca habría que deducirlo de `userId === null`,
   * que es cierto hoy por casualidad y dejaría de serlo en cuanto exista otra
   * forma de entrar sin usuario.
   */
  llave?: { prefix: string; alcances: ApiScope[] };
}

interface AuthenticatedRequest {
  user: AuthUser;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
