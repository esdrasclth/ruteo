import { HttpException } from '@nestjs/common';
import { VentanaMemoria } from '../../common/ventana-memoria';
import { LoginThrottleService } from './login-throttle.service';

// Reglas que, si se rompen, dejan el login a merced de un script o bloquean a
// usuarios legítimos por una avería. Las dos direcciones importan.

function redisFalso() {
  const contadores = new Map<string, number>();
  const bloqueos = new Map<string, number>();
  return {
    incrementWindow: jest.fn((key: string) => {
      const n = (contadores.get(key) ?? 0) + 1;
      contadores.set(key, n);
      return Promise.resolve(n);
    }),
    setJson: jest.fn((key: string, _v: unknown, ttl: number) => {
      bloqueos.set(key, ttl);
      return Promise.resolve();
    }),
    ttl: jest.fn((key: string) => Promise.resolve(bloqueos.get(key) ?? null)),
    del: jest.fn((key: string) => {
      contadores.delete(key);
      bloqueos.delete(key);
      return Promise.resolve();
    }),
    _contadores: contadores,
    _bloqueos: bloqueos,
  };
}

describe('LoginThrottleService', () => {
  it('deja pasar mientras no se llega al tope', async () => {
    const redis = redisFalso();
    const s = new LoginThrottleService(redis as never, new VentanaMemoria());

    for (let i = 0; i < 7; i++) await s.registrarFallo('emp', 'a@b.hn');

    await expect(s.comprobar('emp', 'a@b.hn')).resolves.toBeUndefined();
  });

  it('bloquea al llegar al tope y lo dice con un mensaje accionable', async () => {
    const redis = redisFalso();
    const s = new LoginThrottleService(redis as never, new VentanaMemoria());

    for (let i = 0; i < 8; i++) await s.registrarFallo('emp', 'a@b.hn');

    const intento = s.comprobar('emp', 'a@b.hn');
    await expect(intento).rejects.toBeInstanceOf(HttpException);
    // Un 401 genérico deja al usuario probando su contraseña buena sin entender
    // por qué falla; el mensaje tiene que decir qué pasa y cómo salir.
    await expect(intento).rejects.toThrow(/bloqueada/i);
    await expect(intento).rejects.toThrow(/restablece/i);
  });

  it('bloquea también identificadores que NO existen', async () => {
    // Si solo se bloquearan las cuentas reales, el mensaje delataría cuáles lo
    // son: bastaría con probar correos hasta que uno se bloquee.
    const redis = redisFalso();
    const s = new LoginThrottleService(redis as never, new VentanaMemoria());

    for (let i = 0; i < 8; i++) await s.registrarFallo('emp', 'noexiste@b.hn');

    await expect(s.comprobar('emp', 'noexiste@b.hn')).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('entrar bien borra el historial', async () => {
    const redis = redisFalso();
    const s = new LoginThrottleService(redis as never, new VentanaMemoria());

    for (let i = 0; i < 8; i++) await s.registrarFallo('emp', 'a@b.hn');
    await s.limpiar('emp', 'a@b.hn');

    await expect(s.comprobar('emp', 'a@b.hn')).resolves.toBeUndefined();
  });

  it('el bloqueo es por cuenta, no global', async () => {
    const redis = redisFalso();
    const s = new LoginThrottleService(redis as never, new VentanaMemoria());

    for (let i = 0; i < 8; i++) await s.registrarFallo('emp', 'victima@b.hn');

    await expect(s.comprobar('emp', 'otra@b.hn')).resolves.toBeUndefined();
  });

  describe('con Redis caído', () => {
    // Antes se dejaba de contar, con el argumento de que fallar cerrado
    // convertiría una avería en "nadie puede entrar". El argumento es bueno; la
    // conclusión no lo era. Como el cupo por IP también fallaba abierto y la
    // instancia de ZITADEL no tiene política de bloqueo, una caída de Redis
    // dejaba la fuerza bruta sin ningún freno. Contar en memoria conserva lo
    // que se quería —nadie queda fuera por una avería— sin regalar el freno.
    const redisCaido = () => ({
      ...redisFalso(),
      incrementWindow: jest.fn(() => Promise.resolve(null)),
      ttl: jest.fn(() => Promise.resolve(null)),
      setJson: jest.fn(() => Promise.resolve()),
    });

    it('sigue bloqueando al llegar al tope', async () => {
      const s = new LoginThrottleService(
        redisCaido() as never,
        new VentanaMemoria(),
      );

      for (let i = 0; i < 8; i++) await s.registrarFallo('emp', 'a@b.hn');

      await expect(s.comprobar('emp', 'a@b.hn')).rejects.toBeInstanceOf(
        HttpException,
      );
    });

    it('no bloquea a quien no ha fallado: la avería no deja a nadie fuera', async () => {
      const s = new LoginThrottleService(
        redisCaido() as never,
        new VentanaMemoria(),
      );

      await expect(
        s.comprobar('emp', 'inocente@b.hn'),
      ).resolves.toBeUndefined();
    });

    it('el bloqueo sigue siendo por cuenta', async () => {
      const s = new LoginThrottleService(
        redisCaido() as never,
        new VentanaMemoria(),
      );

      for (let i = 0; i < 8; i++) await s.registrarFallo('emp', 'victima@b.hn');

      await expect(s.comprobar('emp', 'otra@b.hn')).resolves.toBeUndefined();
    });

    it('entrar bien sigue borrando el bloqueo anotado en memoria', async () => {
      const s = new LoginThrottleService(
        redisCaido() as never,
        new VentanaMemoria(),
      );

      for (let i = 0; i < 8; i++) await s.registrarFallo('emp', 'a@b.hn');
      await s.limpiar('emp', 'a@b.hn');

      await expect(s.comprobar('emp', 'a@b.hn')).resolves.toBeUndefined();
    });
  });

  // El bloqueo se anota en los dos sitios a la vez: si solo viviera en Redis,
  // una caída inmediatamente después de imponerlo lo borraría, que es justo
  // cuando hace falta que aguante.
  it('un bloqueo puesto con Redis vivo sobrevive a que Redis se caiga después', async () => {
    const memoria = new VentanaMemoria();
    const redis = redisFalso();
    const s = new LoginThrottleService(redis as never, memoria);

    for (let i = 0; i < 8; i++) await s.registrarFallo('emp', 'a@b.hn');

    // Redis se cae: deja de saber nada de bloqueos.
    redis.ttl.mockResolvedValue(null);

    await expect(s.comprobar('emp', 'a@b.hn')).rejects.toBeInstanceOf(
      HttpException,
    );
  });
});
