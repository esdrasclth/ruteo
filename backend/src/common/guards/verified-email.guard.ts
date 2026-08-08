import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { VERIFIED_EMAIL_KEY } from '../decorators/verified-email.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';

/**
 * Bloquea las acciones marcadas con `@RequiereCorreoVerificado()` mientras el
 * actor no haya probado su correo.
 *
 * Se consulta la fila en la base y NO una claim del token: el token vive hasta
 * 15 minutos, así que alguien que acaba de verificar seguiría bloqueado, y —lo
 * que importa— alguien a quien se le revoque la verificación seguiría pasando
 * hasta que le caducara el token.
 */
@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const exigido = this.reflector.getAllAndOverride<boolean>(
      VERIFIED_EMAIL_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!exigido) return true;

    const user = context.switchToHttp().getRequest().user as
      | AuthUser
      | undefined;
    // Sin usuario en la petición es una llave de API, no una persona: no hay
    // correo que verificar y el control de acceso lo hace su propio guard.
    if (!user?.userId) return true;

    const fila = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.user.findUnique({
        where: { id: user.userId! },
        select: { emailVerified: true },
      }),
    );

    if (!fila?.emailVerified) {
      throw new ForbiddenException(
        'Verifica tu correo para poder hacer esto. Te podemos reenviar el código desde el panel.',
      );
    }
    return true;
  }
}
