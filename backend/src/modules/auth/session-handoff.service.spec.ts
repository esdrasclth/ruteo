import { RedisService } from '../../redis/redis.service';
import { SessionHandoffService } from './session-handoff.service';

/**
 * Redis de mentira con el MISMO contrato que el de verdad, incluido el fallo
 * abierto: `caido = true` hace que escribir no escriba y que leer devuelva
 * `null`, sin lanzar. Ese es justo el modo en el que el respaldo de memoria
 * tiene que sostener el traspaso.
 */
class RedisFalso {
  caido = false;
  private readonly datos = new Map<string, string>();

  setJson(clave: string, valor: unknown): Promise<void> {
    if (!this.caido) this.datos.set(clave, JSON.stringify(valor));
    return Promise.resolve();
  }

  takeJson<T>(clave: string): Promise<T | null> {
    if (this.caido) return Promise.resolve(null);
    const crudo = this.datos.get(clave);
    this.datos.delete(clave);
    return Promise.resolve(crudo ? (JSON.parse(crudo) as T) : null);
  }
}

const DESTINO = {
  tenantId: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
};

describe('SessionHandoffService', () => {
  let redis: RedisFalso;
  let handoff: SessionHandoffService;

  beforeEach(() => {
    redis = new RedisFalso();
    handoff = new SessionHandoffService(redis as unknown as RedisService);
  });

  it('canjea el vale una vez', async () => {
    const vale = await handoff.emitir(DESTINO);
    await expect(handoff.canjear(vale)).resolves.toEqual(DESTINO);
  });

  // Lo que hace que valga ponerlo en una URL: aunque quede en el historial o en
  // el registro de un proxy, al segundo intento ya no abre nada.
  it('el segundo canje del mismo vale no devuelve nada', async () => {
    const vale = await handoff.emitir(DESTINO);
    await handoff.canjear(vale);
    await expect(handoff.canjear(vale)).resolves.toBeNull();
  });

  it('un código inventado no canjea', async () => {
    await expect(handoff.canjear('no-es-un-vale')).resolves.toBeNull();
  });

  it('dos vales del mismo usuario son distintos y valen los dos', async () => {
    const uno = await handoff.emitir(DESTINO);
    const otro = await handoff.emitir(DESTINO);
    expect(uno).not.toBe(otro);
    await expect(handoff.canjear(uno)).resolves.toEqual(DESTINO);
    await expect(handoff.canjear(otro)).resolves.toEqual(DESTINO);
  });

  it('sin Redis se sigue pudiendo entrar', async () => {
    redis.caido = true;
    const vale = await handoff.emitir(DESTINO);
    await expect(handoff.canjear(vale)).resolves.toEqual(DESTINO);
  });

  // El caso que rompe el "un solo uso" si el canje solo borra de donde leyó: el
  // vale está a la vez en Redis y en memoria, siempre.
  it('canjear con Redis en pie también quema la copia de memoria', async () => {
    const vale = await handoff.emitir(DESTINO);
    await expect(handoff.canjear(vale)).resolves.toEqual(DESTINO);

    // Se cae Redis DESPUÉS del canje: si la copia de memoria hubiera
    // sobrevivido, el vale ya usado volvería a abrir la sesión.
    redis.caido = true;
    await expect(handoff.canjear(vale)).resolves.toBeNull();
  });

  it('el vale caducado no canjea', async () => {
    jest.useFakeTimers();
    try {
      const vale = await handoff.emitir(DESTINO);
      // Redis caduca solo por TTL; el respaldo de memoria lo comprueba por
      // reloj, y es ese el que hay que probar.
      redis.caido = true;
      jest.advanceTimersByTime(61_000);
      await expect(handoff.canjear(vale)).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
