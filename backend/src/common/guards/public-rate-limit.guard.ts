import type { PeticionHttp, RespuestaHttp } from '../tipos-peticion';
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
import { VentanaMemoria } from '../ventana-memoria';

/**
 * Límite por IP para endpoints SIN sesión.
 *
 * El `RateLimitGuard` normal se apoya en `request.user` y devuelve `true`
 * cuando no lo hay, así que login, registro y recuperación estaban sin techo:
 * `forgot-password` servía para bombardear el buzón de alguien (y quemar la
 * cuota de Resend) y `register` para crear empresas en bucle.
 *
 * A diferencia del cupo de la API autenticada, este **no falla abierto**: si
 * Redis no responde, sigue contando en memoria del proceso. El otro guard puede
 * permitirse dejar pasar —lo peor que ocurre es que alguien consuma API de más
 * durante una avería—; aquí lo que se cae es el único freno que hay contra la
 * fuerza bruta de contraseñas, porque la instancia de ZITADEL tampoco tiene
 * política de bloqueo (ver `login-throttle.service.ts`). Los detalles y los
 * límites del respaldo están en `VentanaMemoria`.
 */
@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    private readonly memoria: VentanaMemoria,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest<PeticionHttp>();
    const ip = this.resolverIp(request);
    // La ruta entra en la clave para que el límite de `login` no consuma el de
    // `forgot-password`: son abusos distintos y merecen cupos distintos.
    const ruta = String(request.route?.path ?? request.url ?? 'publico');
    const ventana = Math.floor(Date.now() / 1000 / options.windowSeconds);
    const key = `rlp:${ruta}:${ip}:${ventana}`;

    // `null` significa que Redis no está: se sigue contando en memoria en vez
    // de dejar pasar.
    const enRedis = await this.redis.incrementWindow(
      key,
      options.windowSeconds,
    );
    const count =
      enRedis ?? this.memoria.incrementar(key, options.windowSeconds);

    const response = context.switchToHttp().getResponse<RespuestaHttp>();
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

  private resolverIp(request: PeticionHttp): string {
    // `request.ip` a secas, resuelto por Express con `trust proxy` (se fija en
    // `main.ts`).
    //
    // Antes esto leía el primer valor de `x-forwarded-for` a mano, y esa
    // cabecera la escribe quien llama: bastaba mandar una IP distinta en cada
    // petición para tener intentos ilimitados en login, registro y
    // recuperación de contraseña —es decir, el límite no limitaba nada—.
    // Express con `trust proxy: 1` toma el salto de confianza correcto y
    // descarta lo que el cliente haya inventado por delante.
    return request.ip ?? request.socket?.remoteAddress ?? 'desconocida';
  }
}
