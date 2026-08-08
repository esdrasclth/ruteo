import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

// Bloqueo temporal de la cuenta tras varios fallos seguidos.
//
// Se implementa AQUÍ y no con la política de ZITADEL por una razón concreta:
// la política de bloqueo es un ajuste de instancia, y `auth.brandsofts.com`
// está compartido con otros proyectos de Brandsofts —activarla les cambiaría
// el comportamiento a ellos—. Comprobado el 2026-08-08: la instancia la tiene
// desactivada, así que hoy NO hay ningún bloqueo del lado de ZITADEL.
//
// Hacerlo en Ruteo además permite dar un mensaje que explique qué pasa y cómo
// salir; con el 401 genérico, el usuario sigue probando su contraseña buena sin
// entender por qué falla y acaba llamando a soporte.

const INTENTOS_MAX = 8;
const VENTANA_S = 15 * 60;
const BLOQUEO_S = 15 * 60;

@Injectable()
export class LoginThrottleService {
  constructor(private readonly redis: RedisService) {}

  private claveIntentos(slug: string, email: string) {
    return `login:fails:${slug}:${email.toLowerCase()}`;
  }

  private claveBloqueo(slug: string, email: string) {
    return `login:locked:${slug}:${email.toLowerCase()}`;
  }

  /**
   * Corta el paso si la cuenta está bloqueada.
   *
   * Se comprueba ANTES de mirar si el usuario existe y para cualquier
   * identificador, exista o no: si solo se bloquearan las cuentas reales, el
   * mensaje de bloqueo delataría cuáles lo son.
   */
  async comprobar(slug: string, email: string): Promise<void> {
    const restante = await this.redis.ttl(this.claveBloqueo(slug, email));
    if (restante !== null && restante > 0) {
      const minutos = Math.max(1, Math.ceil(restante / 60));
      throw new HttpException(
        `Cuenta bloqueada temporalmente por varios intentos fallidos. ` +
          `Vuelve a probar en ${minutos} minuto${minutos === 1 ? '' : 's'} ` +
          `o restablece tu contraseña.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Suma un fallo y bloquea al llegar al tope. */
  async registrarFallo(slug: string, email: string): Promise<void> {
    const n = await this.redis.incrementWindow(
      this.claveIntentos(slug, email),
      VENTANA_S,
    );
    // Redis caído: no se bloquea a nadie. Es preferible perder el freno un rato
    // a dejar fuera a usuarios legítimos por una avería de infraestructura.
    if (n === null) return;

    if (n >= INTENTOS_MAX) {
      await this.redis.setJson(
        this.claveBloqueo(slug, email),
        { desde: Date.now() },
        BLOQUEO_S,
      );
    }
  }

  /** Entrada correcta: se olvida el historial de fallos. */
  async limpiar(slug: string, email: string): Promise<void> {
    await this.redis.del(this.claveIntentos(slug, email));
    await this.redis.del(this.claveBloqueo(slug, email));
  }
}
