import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { VentanaMemoria } from '../../common/ventana-memoria';
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
  constructor(
    private readonly redis: RedisService,
    private readonly memoria: VentanaMemoria,
  ) {}

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
    const clave = this.claveBloqueo(slug, email);
    // Se mira en los dos sitios. Redis devuelve `null` tanto si no hay bloqueo
    // como si está caído, así que sin consultar la memoria un bloqueo anotado
    // durante la avería se olvidaría en cuanto Redis volviera —o, peor, mientras
    // sigue caído—.
    const restante = (await this.redis.ttl(clave)) ?? this.memoria.ttl(clave);
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
    const claveIntentos = this.claveIntentos(slug, email);
    // Con Redis caído se cuenta en memoria. Antes se devolvía sin contar, y
    // como el cupo por IP fallaba abierto por su lado, una avería de Redis
    // dejaba la fuerza bruta sin ningún freno.
    //
    // El contador de memoria arranca de cero, así que una caída a mitad de una
    // racha de fallos regala los intentos ya acumulados. Es la degradación que
    // se acepta: recuperarlos exigiría duplicar cada escritura en los dos
    // sitios y encarecer todos los logins buenos para cubrir un caso raro.
    const enRedis = await this.redis.incrementWindow(claveIntentos, VENTANA_S);
    const n = enRedis ?? this.memoria.incrementar(claveIntentos, VENTANA_S);

    if (n >= INTENTOS_MAX) {
      const claveBloqueo = this.claveBloqueo(slug, email);
      // El bloqueo se anota en AMBOS sitios, siempre. Son pocos y duran poco
      // (hacen falta ocho fallos para provocar uno), así que la memoria extra
      // es despreciable, y a cambio el bloqueo sobrevive a que Redis se caiga
      // justo después de imponerlo —que es precisamente cuando importa—.
      await this.redis.setJson(claveBloqueo, { desde: Date.now() }, BLOQUEO_S);
      this.memoria.fijar(claveBloqueo, BLOQUEO_S);
    }
  }

  /** Entrada correcta: se olvida el historial de fallos. */
  async limpiar(slug: string, email: string): Promise<void> {
    const claveIntentos = this.claveIntentos(slug, email);
    const claveBloqueo = this.claveBloqueo(slug, email);
    await this.redis.del(claveIntentos);
    await this.redis.del(claveBloqueo);
    // También en memoria: si no, un bloqueo anotado durante una avería
    // sobreviviría a la entrada correcta que debería haberlo levantado.
    this.memoria.borrar(claveIntentos);
    this.memoria.borrar(claveBloqueo);
  }
}
