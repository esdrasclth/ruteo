import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { RedisService } from '../../redis/redis.service';

/**
 * Vale de un solo uso para cruzar del panel raíz al panel de una empresa.
 *
 * **Por qué hace falta un vale y no basta con devolver los tokens.**
 * `panel.ruteo.brandsofts.com` y `enviospress.ruteo.brandsofts.com` son
 * orígenes distintos, y eso es deliberado: el aislamiento de origen por empresa
 * es la razón de ser del acceso por subdominio (ver `docs/acceso-por-subdominio.md`).
 * El `localStorage` del panel raíz no lo puede leer el subdominio, así que la
 * sesión no se puede "llevar": tiene que nacer ya en el origen de la empresa.
 *
 * Lo que viaja en la URL es este vale, no el JWT. Un JWT en la URL se queda en
 * el historial del navegador, en el `Referer` de la primera imagen que cargue
 * la página y en los registros de cualquier proxy por medio, y sigue sirviendo
 * durante toda su vigencia. El vale dura un minuto y muere al primer canje.
 *
 * **No es una credencial reutilizable.** No lleva rol ni permisos dentro: solo
 * apunta a un par (empresa, usuario) que ya demostró su contraseña hace
 * segundos. Los tokens de verdad los emite `AuthService` al canjearlo.
 */

/** Un minuto: lo que tarda un navegador en seguir una redirección, con margen. */
const VIGENCIA_S = 60;

/**
 * Tope de vales vivos en el respaldo de memoria. Con un minuto de vigencia hay
 * que iniciar sesión miles de veces por minuto para acercarse; el tope está por
 * si algún día se alarga la vigencia, no por el tráfico de hoy.
 */
const MAX_EN_MEMORIA = 10_000;

export interface DestinoDelVale {
  tenantId: string;
  userId: string;
}

interface EntradaEnMemoria extends DestinoDelVale {
  hasta: number;
}

@Injectable()
export class SessionHandoffService {
  /**
   * Respaldo en el proceso, porque `RedisService` falla ABIERTO por diseño: si
   * Redis no está, `setJson` no escribe y no avisa. Para una caché es correcto;
   * aquí significaría que nadie puede entrar desde el panel raíz mientras Redis
   * esté caído, y sin ningún error que lo explique.
   *
   * No sustituye a Redis: no se comparte entre procesos, así que con varias
   * instancias detrás del proxy el canje tiene que caer en la misma que emitió
   * el vale. Con Redis en pie —el caso normal— eso da igual, porque el vale
   * está en Redis y lo ve cualquiera.
   */
  private readonly enMemoria = new Map<string, EntradaEnMemoria>();

  constructor(private readonly redis: RedisService) {}

  /** Emite un vale para ese usuario. Devuelve el código en claro, una vez. */
  async emitir(destino: DestinoDelVale): Promise<string> {
    // 256 bits de aleatoriedad criptográfica. `base64url` porque esto acaba en
    // una URL y no debe necesitar escaparse.
    const codigo = randomBytes(32).toString('base64url');
    const clave = this.clave(codigo);

    // Se guarda en los dos sitios, siempre. Son pocos y duran un minuto.
    await this.redis.setJson(clave, destino, VIGENCIA_S);
    this.hacerSitio();
    this.enMemoria.set(clave, {
      ...destino,
      hasta: Date.now() + VIGENCIA_S * 1000,
    });

    return codigo;
  }

  /**
   * Canjea el vale. `null` si no existe, ya se usó o caducó.
   *
   * Quema el vale en AMBOS almacenes aunque solo aparezca en uno: si solo se
   * borrara de donde se leyó, la copia del otro seguiría siendo canjeable y el
   * "un solo uso" pasaría a ser "dos".
   */
  async canjear(codigo: string): Promise<DestinoDelVale | null> {
    const clave = this.clave(codigo);

    const deRedis = await this.redis.takeJson<DestinoDelVale>(clave);
    const deMemoria = this.tomarDeMemoria(clave);

    return deRedis ?? deMemoria;
  }

  /**
   * Solo se guarda el hash. La clave sale de un valor aleatorio de 256 bits, no
   * de un secreto que alguien pueda adivinar, así que no necesita factor de
   * trabajo; SHA-256 basta para que volcar el almacén no entregue vales
   * utilizables.
   */
  private clave(codigo: string): string {
    return `handoff:${createHash('sha256').update(codigo).digest('hex')}`;
  }

  private tomarDeMemoria(clave: string): DestinoDelVale | null {
    const entrada = this.enMemoria.get(clave);
    if (!entrada) return null;
    this.enMemoria.delete(clave);
    if (entrada.hasta <= Date.now()) return null;
    return { tenantId: entrada.tenantId, userId: entrada.userId };
  }

  /** Limpieza perezosa, como `VentanaMemoria`: sin temporizadores que parar. */
  private hacerSitio(): void {
    if (this.enMemoria.size < MAX_EN_MEMORIA) return;
    const ahora = Date.now();
    for (const [clave, entrada] of this.enMemoria) {
      if (entrada.hasta <= ahora) this.enMemoria.delete(clave);
    }
    // Si aún no cabe, se tira lo más antiguo (el Map conserva el orden de
    // inserción). Un vale perdido es un login que hay que repetir; vaciar el
    // mapa entero sería lo mismo para todo el mundo a la vez.
    if (this.enMemoria.size < MAX_EN_MEMORIA) return;
    const aQuitar = Math.ceil(MAX_EN_MEMORIA * 0.1);
    let quitadas = 0;
    for (const clave of this.enMemoria.keys()) {
      if (quitadas >= aQuitar) break;
      this.enMemoria.delete(clave);
      quitadas += 1;
    }
  }
}
