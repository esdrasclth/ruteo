import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PlatformAuthService } from './platform-auth.service';

/**
 * Guard del panel de plataforma.
 *
 * Deliberadamente NO reutiliza `JwtAuthGuard`: valida con otro secreto y exige
 * la claim `scope: 'platform'`. Compartir guard invitaría a que un cambio
 * futuro en el de tenant abriera esta puerta sin que nadie lo note.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(private readonly auth: PlatformAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const cabecera = String(req.headers?.authorization ?? '');
    if (!cabecera.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta la sesión de plataforma');
    }
    req.platformAdmin = await this.auth.verificarToken(cabecera.slice(7));
    return true;
  }
}
