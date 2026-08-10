import { VentanaMemoria } from './ventana-memoria';

// Es el freno que queda cuando Redis no está. Si cuenta mal, no se nota: se
// nota el día que alguien recorre contraseñas sin que nada le pare.

describe('VentanaMemoria', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('acumula dentro de la misma ventana', () => {
    const v = new VentanaMemoria();
    expect(v.incrementar('k', 60)).toBe(1);
    expect(v.incrementar('k', 60)).toBe(2);
    expect(v.incrementar('k', 60)).toBe(3);
  });

  it('lleva las claves por separado', () => {
    const v = new VentanaMemoria();
    v.incrementar('a', 60);
    v.incrementar('a', 60);
    expect(v.incrementar('b', 60)).toBe(1);
  });

  it('empieza de cero cuando la ventana vence', () => {
    const v = new VentanaMemoria();
    v.incrementar('k', 60);
    v.incrementar('k', 60);

    jest.advanceTimersByTime(61_000);

    expect(v.incrementar('k', 60)).toBe(1);
  });

  describe('ttl', () => {
    it('devuelve null si la clave no existe', () => {
      expect(new VentanaMemoria().ttl('nada')).toBeNull();
    });

    it('devuelve lo que queda de la marca', () => {
      const v = new VentanaMemoria();
      v.fijar('bloqueo', 900);
      jest.advanceTimersByTime(300_000);
      expect(v.ttl('bloqueo')).toBe(600);
    });

    it('devuelve null cuando ya venció', () => {
      const v = new VentanaMemoria();
      v.fijar('bloqueo', 900);
      jest.advanceTimersByTime(901_000);
      expect(v.ttl('bloqueo')).toBeNull();
    });
  });

  it('borrar deja la clave sin rastro', () => {
    const v = new VentanaMemoria();
    v.fijar('bloqueo', 900);
    v.borrar('bloqueo');
    expect(v.ttl('bloqueo')).toBeNull();
  });

  // Sin tope, un barrido de IPs distintas se come la memoria del proceso.
  it('no crece sin límite ante un barrido de claves distintas', () => {
    const v = new VentanaMemoria();
    for (let i = 0; i < 60_000; i++) v.incrementar(`ip-${i}`, 900);

    const vivas = Array.from({ length: 60_000 }, (_, i) =>
      v.ttl(`ip-${i}`),
    ).filter((t) => t !== null).length;

    expect(vivas).toBeLessThanOrEqual(50_000);
  });

  // Y lo que se desaloja es lo más viejo, no todo: vaciar entero sería la
  // palanca para borrar el bloqueo de una cuenta generando claves basura.
  it('al desalojar conserva lo más reciente', () => {
    const v = new VentanaMemoria();
    for (let i = 0; i < 55_000; i++) v.incrementar(`ip-${i}`, 900);

    expect(v.ttl('ip-54999')).not.toBeNull();
  });
});
