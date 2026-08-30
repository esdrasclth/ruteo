import { Prisma } from '@prisma/client';
import {
  calcularPesos,
  DIVISOR_POR_DEFECTO,
  pesoCobrable,
  pesoVolumetrico,
} from './pesos';

// Esto decide cuánto se le cobra a cada cliente por cada bulto. Un error aquí no
// se ve: sale una factura un poco más barata o un poco más cara, y nadie lo nota
// hasta que alguien suma el mes.

const d = (n: string | number) => new Prisma.Decimal(n);

describe('pesoVolumetrico', () => {
  it('aplica largo × ancho × alto / divisor', () => {
    // 50 × 40 × 30 = 60.000 cm³ / 5000 = 12 kg
    expect(
      pesoVolumetrico({ lengthCm: 50, widthCm: 40, heightCm: 30 })?.toString(),
    ).toBe('12');
  });

  it('usa el divisor del tenant y no el de por defecto', () => {
    // El mismo bulto con divisor 6000 sale a 10 kg. Es exactamente la diferencia
    // que negocia un cliente grande, así que tiene que salir del dato y no del
    // código.
    expect(
      pesoVolumetrico(
        { lengthCm: 50, widthCm: 40, heightCm: 30 },
        6000,
      )?.toString(),
    ).toBe('10');
  });

  it('redondea a tres decimales, que es lo que guarda la columna', () => {
    // 33 × 22 × 11 = 7986 / 5000 = 1.5972
    expect(
      pesoVolumetrico({ lengthCm: 33, widthCm: 22, heightCm: 11 })?.toString(),
    ).toBe('1.597');
  });

  // Con dos de tres medidas no hay volumen. Inventar la que falta produciría un
  // cobro inventado.
  it.each([
    [{ lengthCm: 50, widthCm: 40, heightCm: null }],
    [{ lengthCm: 50, widthCm: null, heightCm: 30 }],
    [{ lengthCm: null, widthCm: 40, heightCm: 30 }],
    [{}],
  ])('sin las tres medidas devuelve null (%o)', (dim) => {
    expect(pesoVolumetrico(dim)).toBeNull();
  });

  it('una medida en cero o negativa no es una medida', () => {
    expect(
      pesoVolumetrico({ lengthCm: 0, widthCm: 40, heightCm: 30 }),
    ).toBeNull();
    expect(
      pesoVolumetrico({ lengthCm: -5, widthCm: 40, heightCm: 30 }),
    ).toBeNull();
  });

  // Una configuración mala no debe convertirse en una factura mala.
  it('un divisor inválido cae al de por defecto en vez de dar infinito', () => {
    const esperado = pesoVolumetrico(
      { lengthCm: 50, widthCm: 40, heightCm: 30 },
      DIVISOR_POR_DEFECTO,
    );
    expect(
      pesoVolumetrico(
        { lengthCm: 50, widthCm: 40, heightCm: 30 },
        0,
      )?.toString(),
    ).toBe(esperado?.toString());
    expect(
      pesoVolumetrico(
        { lengthCm: 50, widthCm: 40, heightCm: 30 },
        -1,
      )?.toString(),
    ).toBe(esperado?.toString());
  });
});

describe('pesoCobrable', () => {
  it('gana el volumétrico cuando el bulto es liviano y voluminoso', () => {
    // El caso que justifica todo esto: la caja de almohadas.
    expect(pesoCobrable(d(2), d(12))?.toString()).toBe('12');
  });

  it('gana el real cuando el bulto es pesado y compacto', () => {
    expect(pesoCobrable(d(20), d(12))?.toString()).toBe('20');
  });

  it('empatados, da igual cuál', () => {
    expect(pesoCobrable(d(12), d(12))?.toString()).toBe('12');
  });

  it('con solo uno de los dos, ese', () => {
    expect(pesoCobrable(d(3), null)?.toString()).toBe('3');
    expect(pesoCobrable(null, d(7))?.toString()).toBe('7');
  });

  // Cobrar cero por no haber medido es peor que dejarlo pendiente y que se vea.
  it('sin ninguno, null y no cero', () => {
    expect(pesoCobrable(null, null)).toBeNull();
    expect(pesoCobrable(undefined, null)).toBeNull();
  });
});

describe('calcularPesos', () => {
  it('devuelve los dos con las medidas de una caja liviana', () => {
    const pesos = calcularPesos(2.4, {
      lengthCm: 50,
      widthCm: 40,
      heightCm: 30,
    });
    expect(pesos.volumetricWeightKg?.toString()).toBe('12');
    expect(pesos.chargeableWeightKg?.toString()).toBe('12');
  });

  it('sin medidas, el cobrable es el real', () => {
    const pesos = calcularPesos(2.4, {});
    expect(pesos.volumetricWeightKg).toBeNull();
    expect(pesos.chargeableWeightKg?.toString()).toBe('2.4');
  });
});
