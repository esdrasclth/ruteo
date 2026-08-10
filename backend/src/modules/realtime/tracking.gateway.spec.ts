import type { Socket } from 'socket.io';
import { TrackingGateway } from './tracking.gateway';

// El canal público de "¿dónde está mi paquete?". No pide sesión ni pasa por
// ningún guard, así que lo único que lo separa de ser un sumidero de memoria es
// lo que compruebe aquí dentro.

// `rooms` de socket.io siempre contiene la sala propia del socket (su id); el
// tope se cuenta sobre las demás, y este doble tiene que reflejarlo o la prueba
// mediría otra cosa.
function socketFalso(id = 'sock-1') {
  const rooms = new Set<string>([id]);
  return {
    id,
    rooms,
    join: jest.fn((sala: string) => {
      rooms.add(sala);
    }),
    leave: jest.fn((sala: string) => {
      rooms.delete(sala);
    }),
  };
}

const como = (s: ReturnType<typeof socketFalso>) => s as unknown as Socket;

// El alfabeto de los números de rastreo deja fuera 0/O/1/I por ambiguos, así
// que los distintivos se arman con él y no rellenando con dígitos.
const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const numero = (n: number) =>
  `RUT-${ALFABETO[Math.floor(n / 32) % 32]}${ALFABETO[n % 32]}${'2'.repeat(8)}`;

describe('TrackingGateway.onSubscribe', () => {
  let gateway: TrackingGateway;

  beforeEach(() => {
    gateway = new TrackingGateway();
  });

  it('suscribe a un número bien formado', () => {
    const s = socketFalso();
    const r = gateway.onSubscribe(como(s), {
      trackingNumber: 'RUT-23456789AB',
    });

    expect(r).toEqual({ subscribed: 'RUT-23456789AB' });
    expect(s.join).toHaveBeenCalledWith('tracking:RUT-23456789AB');
  });

  // Sin esto, cualquier cadena creaba una sala que ningún envío iba a usar.
  it.each([
    ['vacío', ''],
    ['sin prefijo', '23456789AB'],
    ['demasiado corto', 'RUT-2345'],
    ['con letras ambiguas que el alfabeto no usa', 'RUT-0O1I234567'],
    ['texto arbitrario', '../../etc/passwd'],
  ])('no crea sala con %s', (_caso, valor) => {
    const s = socketFalso();
    const r = gateway.onSubscribe(como(s), { trackingNumber: valor });

    expect(r).toEqual({ subscribed: null });
    expect(s.join).not.toHaveBeenCalled();
  });

  it('no crea sala si no viene número', () => {
    const s = socketFalso();
    expect(gateway.onSubscribe(como(s), {})).toEqual({ subscribed: null });
    expect(s.join).not.toHaveBeenCalled();
  });

  it('corta al llegar al tope de salas por conexión', () => {
    const s = socketFalso();
    for (let i = 0; i < 20; i++) {
      expect(
        gateway.onSubscribe(como(s), { trackingNumber: numero(i) }).subscribed,
      ).not.toBeNull();
    }

    // La 21 ya no entra.
    expect(
      gateway.onSubscribe(como(s), { trackingNumber: numero(99) }),
    ).toEqual({ subscribed: null });
    expect(s.rooms.size).toBe(21); // 20 salas + la propia del socket
  });

  // Reenviar la misma suscripción es lo normal al reconectar; no debería gastar
  // cupo ni, mucho menos, dejar al cliente fuera de lo que ya seguía.
  it('resuscribirse a algo que ya se sigue no consume cupo', () => {
    const s = socketFalso();
    for (let i = 0; i < 20; i++) {
      gateway.onSubscribe(como(s), { trackingNumber: numero(i) });
    }

    expect(gateway.onSubscribe(como(s), { trackingNumber: numero(0) })).toEqual(
      { subscribed: numero(0) },
    );
  });

  it('darse de baja libera cupo', () => {
    const s = socketFalso();
    for (let i = 0; i < 20; i++) {
      gateway.onSubscribe(como(s), { trackingNumber: numero(i) });
    }
    gateway.onUnsubscribe(como(s), { trackingNumber: numero(0) });

    expect(
      gateway.onSubscribe(como(s), { trackingNumber: numero(99) }).subscribed,
    ).toBe(numero(99));
  });
});
