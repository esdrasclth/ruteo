import { Injectable } from '@nestjs/common';

/**
 * Contador de ventana fija en memoria del proceso. Es el respaldo de Redis para
 * los frenos que protegen credenciales.
 *
 * **Por qué hace falta.** `RedisService` falla abierto por decisión deliberada:
 * una caída de Redis no debe dejar a nadie sin poder trabajar. Para el cupo de
 * la API es lo correcto. Para el login no: los tres frenos de autenticación
 * —cupo por IP de `login`, `register` y `forgot-password`, y el bloqueo por
 * cuenta de `LoginThrottleService`— viven todos en Redis, así que caían juntos.
 * Con ZITADEL sin política de bloqueo (ver `login-throttle.service.ts`), un
 * Redis apagado dejaba la fuerza bruta completamente libre, y bastaba con que
 * Redis tardara en levantar más que el backend para abrir esa ventana sin que
 * nadie hiciera nada.
 *
 * **Lo que este respaldo no es.** No sustituye a Redis: no se comparte entre
 * procesos, así que con varias instancias detrás del proxy cada una cuenta por
 * su lado y el techo real se multiplica por el número de instancias. Frenar N
 * veces más despacio de lo previsto sigue siendo infinitamente mejor que no
 * frenar, que es lo que había. Cuando Redis vuelve, se vuelve a contar allí.
 */

interface Entrada {
  /** Momento (epoch ms) en el que la ventana deja de valer. */
  hasta: number;
  cuenta: number;
}

/**
 * Tope de claves vivas. Cada entrada son unas decenas de bytes, así que 50.000
 * es del orden de unos pocos MB: suficiente para no notarse y suficiente para
 * que un barrido de IPs no se coma la memoria del proceso.
 */
const MAX_CLAVES = 50_000;

/** Qué proporción se descarta cuando ni barrer lo caducado deja sitio. */
const PROPORCION_DESALOJO = 0.1;

@Injectable()
export class VentanaMemoria {
  private readonly entradas = new Map<string, Entrada>();

  /** Suma uno a la ventana y devuelve el total acumulado en ella. */
  incrementar(clave: string, ventanaSegundos: number): number {
    this.hacerSitio();
    const ahora = Date.now();
    const actual = this.entradas.get(clave);

    if (!actual || actual.hasta <= ahora) {
      this.entradas.set(clave, {
        hasta: ahora + ventanaSegundos * 1000,
        cuenta: 1,
      });
      return 1;
    }

    actual.cuenta += 1;
    return actual.cuenta;
  }

  /** Marca una clave durante N segundos, para bloqueos. */
  fijar(clave: string, segundos: number): void {
    this.hacerSitio();
    this.entradas.set(clave, {
      hasta: Date.now() + segundos * 1000,
      cuenta: 1,
    });
  }

  /**
   * Segundos que le quedan a la clave, o `null` si no existe o ya venció.
   * Mismo contrato que `RedisService.ttl` para que quien llama no tenga que
   * distinguir de dónde viene la respuesta.
   */
  ttl(clave: string): number | null {
    const entrada = this.entradas.get(clave);
    if (!entrada) return null;

    const restante = Math.ceil((entrada.hasta - Date.now()) / 1000);
    if (restante <= 0) {
      this.entradas.delete(clave);
      return null;
    }
    return restante;
  }

  borrar(clave: string): void {
    this.entradas.delete(clave);
  }

  /**
   * Limpieza perezosa: solo cuando el mapa llega al tope, en vez de con un
   * temporizador. Un `setInterval` habría que pararlo al apagar el módulo y es
   * una pieza más que puede quedarse colgada; aquí el coste se paga en la
   * petición que llena el mapa y solo entonces.
   */
  private hacerSitio(): void {
    if (this.entradas.size < MAX_CLAVES) return;

    const ahora = Date.now();
    for (const [clave, entrada] of this.entradas) {
      if (entrada.hasta <= ahora) this.entradas.delete(clave);
    }
    if (this.entradas.size < MAX_CLAVES) return;

    // Todo lo que hay sigue vigente: es un barrido de claves distintas en curso.
    // Se desaloja lo MÁS ANTIGUO (el Map conserva el orden de inserción) en vez
    // de vaciar entero, porque vaciar sería justo la palanca que busca quien
    // hace el barrido: generar claves basura para borrar el bloqueo de la
    // cuenta a la que apunta.
    const aQuitar = Math.ceil(MAX_CLAVES * PROPORCION_DESALOJO);
    let quitadas = 0;
    for (const clave of this.entradas.keys()) {
      if (quitadas >= aQuitar) break;
      this.entradas.delete(clave);
      quitadas += 1;
    }
  }
}
