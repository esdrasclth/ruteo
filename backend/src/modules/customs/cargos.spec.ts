import { ChargeConcept, ChargeKind, Prisma } from '@prisma/client';
import { cargosDeLiquidacion, totalizar } from './cargos';

// La separacion entre ingreso propio y tributo trasladado es lo unico que
// permite responder, a fin de mes, cuanto se gano de verdad. Con todo sumado en
// una cifra, la respuesta es el total cobrado, que incluye dinero del Estado.

const d = (n: string | number) => new Prisma.Decimal(n);

describe('cargosDeLiquidacion', () => {
  it('separa los tributos del ingreso propio', () => {
    const cargos = cargosDeLiquidacion({
      dutyAmount: d('17.25'),
      taxAmount: d('19.84'),
      handlingFee: d(10),
    });

    expect(cargos).toEqual([
      {
        concept: ChargeConcept.DUTY,
        kind: ChargeKind.PASS_THROUGH,
        amount: d('17.25'),
      },
      {
        concept: ChargeConcept.TAX,
        kind: ChargeKind.PASS_THROUGH,
        amount: d('19.84'),
      },
      {
        concept: ChargeConcept.HANDLING,
        kind: ChargeKind.REVENUE,
        amount: d(10),
      },
    ]);
  });

  // Un arancel de cero no es un cargo, es la ausencia de uno. Crearlo llenaria
  // la tabla de filas que nadie va a cobrar y ensuciaria cualquier recuento.
  it('omite los importes en cero', () => {
    const cargos = cargosDeLiquidacion({
      dutyAmount: d(0),
      taxAmount: d(5),
      handlingFee: null,
    });
    expect(cargos.map((c) => c.concept)).toEqual([ChargeConcept.TAX]);
  });

  it('una liquidacion exenta no genera cargos', () => {
    expect(cargosDeLiquidacion({ dutyAmount: d(0), taxAmount: d(0) })).toEqual(
      [],
    );
  });
});

describe('totalizar', () => {
  it('la pregunta del cierre de mes', () => {
    const t = totalizar([
      { kind: ChargeKind.PASS_THROUGH, amount: d('17.25') },
      { kind: ChargeKind.PASS_THROUGH, amount: d('19.84') },
      { kind: ChargeKind.REVENUE, amount: d(10) },
      { kind: ChargeKind.REVENUE, amount: d(25) },
    ]);
    expect(t.ingreso.toString()).toBe('35');
    expect(t.trasladado.toString()).toBe('37.09');
    expect(t.total.toString()).toBe('72.09');
  });

  it('sin cargos, ceros y no nulos', () => {
    const t = totalizar([]);
    expect(t.ingreso.toString()).toBe('0');
    expect(t.total.toString()).toBe('0');
  });
});
