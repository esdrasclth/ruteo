import { CustomsCategory, Prisma } from '@prisma/client';
import {
  documentosQueFaltan,
  elegirRegla,
  liquidar,
  ReglaAplicable,
  valorAduanero,
  vigenteEn,
} from './reglas';

// Esto decide bajo qué categoría se despacha cada envío y cuánto se le liquida.
// Un error aquí no se ve: sale una factura de aduana un poco distinta, y el
// problema aparece meses después cuando alguien la audita.

const d = (n: string | number) => new Prisma.Decimal(n);

function regla(p: Partial<ReglaAplicable> = {}): ReglaAplicable {
  return {
    id: 'r1',
    country: 'HN',
    category: CustomsCategory.B,
    maxValue: d(1000),
    currency: 'USD',
    requiresInvoice: false,
    requiresPermit: false,
    requiresBroker: false,
    dutyRate: d('0.15'),
    taxRate: d('0.15'),
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    ...p,
  };
}

describe('valorAduanero', () => {
  // El error clásico: liquidar sobre lo que decía la factura de la tienda en vez
  // de sobre lo que costó poner la mercancía en la frontera.
  it('suma mercancía, flete, seguro y otros cargos', () => {
    expect(
      valorAduanero({
        productValue: 100,
        freightAmount: 15,
        insuranceAmount: 5,
        otherCharges: 2.5,
      }).toString(),
    ).toBe('122.5');
  });

  it('lo que falta vale cero, no rompe', () => {
    expect(valorAduanero({ productValue: 100 }).toString()).toBe('100');
    expect(valorAduanero({}).toString()).toBe('0');
  });
});

describe('vigenteEn', () => {
  const r = regla({
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: new Date('2026-06-01'),
  });

  it('dentro del periodo', () => {
    expect(vigenteEn(r, new Date('2026-03-01'))).toBe(true);
  });

  it('antes de empezar, no', () => {
    expect(vigenteEn(r, new Date('2025-12-31'))).toBe(false);
  });

  // Cerrado por la izquierda, abierto por la derecha: una regla que termina el
  // día 1 y otra que empieza el día 1 no se solapan, que es como se encadenan.
  it('el día de inicio sí, el de fin no', () => {
    expect(vigenteEn(r, new Date('2026-01-01'))).toBe(true);
    expect(vigenteEn(r, new Date('2026-06-01'))).toBe(false);
  });

  it('sin fecha de fin sigue vigente', () => {
    expect(
      vigenteEn(regla({ effectiveTo: null }), new Date('2030-01-01')),
    ).toBe(true);
  });
});

describe('elegirRegla', () => {
  const documentos = regla({
    id: 'A',
    category: CustomsCategory.A,
    maxValue: d(100),
  });
  const comercial = regla({
    id: 'B',
    category: CustomsCategory.B,
    maxValue: d(1000),
  });
  const general = regla({
    id: 'C',
    category: CustomsCategory.C,
    maxValue: null,
  });
  const todas = [general, comercial, documentos];

  // Sin este orden, un sobre de documentos acabaría despachado como mercancía
  // comercial y pagando lo que no le toca.
  it('gana la categoría más barata que cubra el valor', () => {
    expect(elegirRegla(todas, 'HN', d(50))?.id).toBe('A');
    expect(elegirRegla(todas, 'HN', d(500))?.id).toBe('B');
  });

  it('la sin tope solo se usa cuando ninguna acotada alcanza', () => {
    expect(elegirRegla(todas, 'HN', d(5000))?.id).toBe('C');
  });

  it('justo en el tope, la acotada todavía aplica', () => {
    expect(elegirRegla(todas, 'HN', d(1000))?.id).toBe('B');
    expect(elegirRegla(todas, 'HN', d('1000.01'))?.id).toBe('C');
  });

  it('no mezcla países', () => {
    expect(elegirRegla(todas, 'GT', d(50))).toBeNull();
  });

  it('ignora las que no estaban vigentes ese día', () => {
    const vieja = regla({
      id: 'vieja',
      maxValue: d(100),
      effectiveTo: new Date('2026-01-31'),
    });
    expect(
      elegirRegla([vieja], 'HN', d(50), new Date('2026-03-01')),
    ).toBeNull();
    expect(elegirRegla([vieja], 'HN', d(50), new Date('2026-01-15'))?.id).toBe(
      'vieja',
    );
  });

  // A igualdad de tope gana la más reciente: es la corrección de la misma norma.
  it('con dos reglas del mismo tope, la que empezó más tarde', () => {
    const antigua = regla({ id: 'ant', effectiveFrom: new Date('2026-01-01') });
    const nueva = regla({ id: 'nueva', effectiveFrom: new Date('2026-05-01') });
    expect(
      elegirRegla([antigua, nueva], 'HN', d(500), new Date('2026-06-01'))?.id,
    ).toBe('nueva');
  });

  // No se inventa una por defecto: un envío sin regla no se puede liquidar, y
  // hay que decirlo en vez de cobrar con cifras que nadie configuró.
  it('sin reglas devuelve null y no una inventada', () => {
    expect(elegirRegla([], 'HN', d(50))).toBeNull();
  });
});

describe('liquidar', () => {
  it('arancel sobre el valor aduanero, impuesto sobre valor más arancel', () => {
    // 100 + 15 flete = 115. Arancel 15 % = 17.25. Impuesto 15 % de 132.25 = 19.84.
    const l = liquidar(regla(), { productValue: 100, freightAmount: 15 });
    expect(l.customsValue.toString()).toBe('115');
    expect(l.dutyAmount.toString()).toBe('17.25');
    expect(l.taxAmount.toString()).toBe('19.84');
    expect(l.totalCharges.toString()).toBe('37.09');
  });

  // El manejo es un cargo de la empresa, no un tributo: entra en el total pero
  // no en la base imponible. Meterlo en la base sería cobrar impuesto sobre el
  // propio margen.
  it('el manejo suma al total pero no engorda la base imponible', () => {
    const sin = liquidar(regla(), { productValue: 100 });
    const con = liquidar(regla(), { productValue: 100 }, 10);
    expect(con.dutyAmount.toString()).toBe(sin.dutyAmount.toString());
    expect(con.taxAmount.toString()).toBe(sin.taxAmount.toString());
    expect(con.totalCharges.minus(sin.totalCharges).toString()).toBe('10');
  });

  it('una categoría exenta liquida cero', () => {
    const l = liquidar(regla({ dutyRate: d(0), taxRate: d(0) }), {
      productValue: 500,
    });
    expect(l.totalCharges.toString()).toBe('0');
  });
});

describe('documentosQueFaltan', () => {
  it('dice cuáles faltan, por nombre', () => {
    expect(
      documentosQueFaltan(
        regla({ requiresInvoice: true, requiresPermit: true }),
        {
          requiereFactura: false,
          requierePermiso: true,
        },
      ),
    ).toEqual(['factura comercial']);
  });

  it('sin exigencias no falta nada', () => {
    expect(
      documentosQueFaltan(regla(), {
        requiereFactura: false,
        requierePermiso: false,
      }),
    ).toEqual([]);
  });
});
