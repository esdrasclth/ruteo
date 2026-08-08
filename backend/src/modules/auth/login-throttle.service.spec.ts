import { HttpException } from '@nestjs/common';
import { LoginThrottleService } from './login-throttle.service';

// Reglas que, si se rompen, dejan el login a merced de un script o bloquean a
// usuarios legítimos por una avería. Las dos direcciones importan.

function redisFalso() {
  const contadores = new Map<string, number>();
  const bloqueos = new Map<string, number>();
  return {
    incrementWindow: jest.fn(async (key: string) => {
      const n = (contadores.get(key) ?? 0) + 1;
      contadores.set(key, n);
      return n;
    }),
    setJson: jest.fn(async (key: string, _v: unknown, ttl: number) => {
      bloqueos.set(key, ttl);
    }),
    ttl: jest.fn(async (key: string) => bloqueos.get(key) ?? null),
    del: jest.fn(async (key: string) => {
      contadores.delete(key);
      bloqueos.delete(key);
    }),
    _contadores: contadores,
    _bloqueos: bloqueos,
  };
}

describe('LoginThrottleService', () => {
  it('deja pasar mientras no se llega al tope', async () => {
    const redis = redisFalso();
    const s = new LoginThrottleService(redis as never);

    for (let i = 0; i < 7; i++) await s.registrarFallo('emp', 'a@b.hn');

    await expect(s.comprobar('emp', 'a@b.hn')).resolves.toBeUndefined();
  });

  it('bloquea al llegar al tope y lo dice con un mensaje accionable', async () => {
    const redis = redisFalso();
    const s = new LoginThrottleService(redis as never);

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
    const s = new LoginThrottleService(redis as never);

    for (let i = 0; i < 8; i++) await s.registrarFallo('emp', 'noexiste@b.hn');

    await expect(s.comprobar('emp', 'noexiste@b.hn')).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('entrar bien borra el historial', async () => {
    const redis = redisFalso();
    const s = new LoginThrottleService(redis as never);

    for (let i = 0; i < 8; i++) await s.registrarFallo('emp', 'a@b.hn');
    await s.limpiar('emp', 'a@b.hn');

    await expect(s.comprobar('emp', 'a@b.hn')).resolves.toBeUndefined();
  });

  it('el bloqueo es por cuenta, no global', async () => {
    const redis = redisFalso();
    const s = new LoginThrottleService(redis as never);

    for (let i = 0; i < 8; i++) await s.registrarFallo('emp', 'victima@b.hn');

    await expect(s.comprobar('emp', 'otra@b.hn')).resolves.toBeUndefined();
  });

  it('con Redis caído NO bloquea a nadie', async () => {
    // Fallar cerrado aquí convertiría una avería de Redis en "nadie puede
    // entrar", que es peor que perder el freno un rato.
    const redis = {
      ...redisFalso(),
      incrementWindow: jest.fn(async () => null),
      ttl: jest.fn(async () => null),
    };
    const s = new LoginThrottleService(redis as never);

    for (let i = 0; i < 20; i++) await s.registrarFallo('emp', 'a@b.hn');

    await expect(s.comprobar('emp', 'a@b.hn')).resolves.toBeUndefined();
  });
});
