import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../../redis/redis.service';
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
} from '../decorators/rate-limit.decorator';

/**
 * Límite por IP para endpoints SIN sesión.
 *
 * El `RateLimitGuard` normal se apoya en `request.user` y devuelve `true`
 * cuando no lo hay, así que login, registro y recuperación estaban sin techo:
 * `forgot-password` servía para bombardear el buzón de alguien (y quemar la
 * cuota de Resend) y `register` para crear empresas en bucle.
 *
 * Falla ABIERTO si Redis no responde, igual que el otro guard: una caída de
 * Redis no debe dejar a nadie sin poder entrar.
 */
@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest();
    const ip = this.resolverIp(request);
    // La ruta entra en la clave para que el límite de `login` no consuma el de
    // `forgot-password`: son abusos distintos y merecen cupos distintos.
    const ruta = String(request.route?.path ?? request.url ?? 'publico');
    const ventana = Math.floor(Date.now() / 1000 / options.windowSeconds);
    const key = `rlp:${ruta}:${ip}:${ventana}`;

    const count = await this.redis.incrementWindow(key, options.windowSeconds);
    if (count === null) return true;

    const response = context.switchToHttp().getResponse();
    response.setHeader('X-RateLimit-Limit', options.limit);
    response.setHeader(
      'X-RateLimit-Remaining',
      Math.max(0, options.limit - count),
    );

    if (count > options.limit) {
      const retryAfter =
        (ventana + 1) * options.windowSeconds - Math.floor(Date.now() / 1000);
      response.setHeader('Retry-After', Math.max(1, retryAfter));
      throw new HttpException(
        'Demasiados intentos. Espera un momento y vuelve a probar.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private resolverIp(request: {
    headers?: Record<string, unknown>;
    ip?: string;
    socket?: { remoteAddress?: string };
  }): string {
    // Detrás de un proxy, `request.ip` es la del proxy y todo el mundo
    // compartiría cupo. Se toma el primer valor de `x-forwarded-for`, que es el
    // cliente original.
    const fwd = request.headers?.['x-forwarded-for'];
    const cabecera = Array.isArray(fwd) ? fwd[0] : fwd;
    if (typeof cabecera === 'string' && cabecera.trim()) {
      return cabecera.split(',')[0].trim();
    }
    return request.ip ?? request.socket?.remoteAddress ?? 'desconocida';
  }
}
