import { ChargeConcept, ChargeKind, Prisma } from '@prisma/client';

/**
 * De una liquidación aduanera a cargos con naturaleza declarada.
 *
 * **El punto de la fase 4**: hasta ahora arancel, impuesto y manejo vivían en
 * la misma fila de `CustomsRecord`, y con eso no se puede responder cuánto de lo
 * cobrado es ingreso propio y cuánto es tributo que solo se está trasladando.
 * Son cosas distintas contablemente: una va al estado de resultados, la otra es
 * una deuda con el Estado desde el momento en que se cobra.
 */

export interface CargoACrear {
  concept: ChargeConcept;
  kind: ChargeKind;
  amount: Prisma.Decimal;
}

/**
 * Naturaleza por defecto de cada concepto.
 *
 * Es un DEFECTO, no una ley: se guarda en la fila porque un mismo concepto puede
 * cambiar de naturaleza según el acuerdo. Hay couriers que absorben el manejo y
 * otros que lo trasladan, y deducirlo del concepto al leer haría imposible el
 * segundo caso.
 */
export const NATURALEZA_POR_DEFECTO: Record<ChargeConcept, ChargeKind> = {
  // Del Estado: se cobran y se entregan.
  [ChargeConcept.DUTY]: ChargeKind.PASS_THROUGH,
  [ChargeConcept.TAX]: ChargeKind.PASS_THROUGH,
  [ChargeConcept.PERMIT]: ChargeKind.PASS_THROUGH,
  // De la empresa.
  [ChargeConcept.FREIGHT]: ChargeKind.REVENUE,
  [ChargeConcept.HANDLING]: ChargeKind.REVENUE,
  [ChargeConcept.FUEL]: ChargeKind.REVENUE,
  [ChargeConcept.INSURANCE]: ChargeKind.REVENUE,
  [ChargeConcept.STORAGE]: ChargeKind.REVENUE,
  [ChargeConcept.DELIVERY]: ChargeKind.REVENUE,
  [ChargeConcept.REPACK]: ChargeKind.REVENUE,
  [ChargeConcept.OTHER]: ChargeKind.REVENUE,
};

/**
 * Los cargos que genera una liquidación.
 *
 * Se omite lo que vale cero: un arancel de 0 no es un cargo, es la ausencia de
 * uno, y crearlo llenaría la tabla de filas que nadie va a cobrar y que ensucian
 * cualquier recuento.
 */
export function cargosDeLiquidacion(liq: {
  dutyAmount?: Prisma.Decimal | null;
  taxAmount?: Prisma.Decimal | null;
  handlingFee?: Prisma.Decimal | null;
}): CargoACrear[] {
  const piezas: [ChargeConcept, Prisma.Decimal | null | undefined][] = [
    [ChargeConcept.DUTY, liq.dutyAmount],
    [ChargeConcept.TAX, liq.taxAmount],
    [ChargeConcept.HANDLING, liq.handlingFee],
  ];

  return piezas
    .filter(([, importe]) => importe != null && importe.gt(0))
    .map(([concept, importe]) => ({
      concept,
      kind: NATURALEZA_POR_DEFECTO[concept],
      amount: importe as Prisma.Decimal,
    }));
}

export interface Totales {
  ingreso: Prisma.Decimal;
  trasladado: Prisma.Decimal;
  total: Prisma.Decimal;
}

/**
 * Lo que antes era imposible: separar lo que es mío de lo que solo paso.
 *
 * Es la consulta del cierre de mes, y la razón de que `kind` exista.
 */
export function totalizar(
  cargos: { kind: ChargeKind; amount: Prisma.Decimal }[],
): Totales {
  const cero = new Prisma.Decimal(0);
  const ingreso = cargos
    .filter((c) => c.kind === ChargeKind.REVENUE)
    .reduce((s, c) => s.plus(c.amount), cero);
  const trasladado = cargos
    .filter((c) => c.kind === ChargeKind.PASS_THROUGH)
    .reduce((s, c) => s.plus(c.amount), cero);
  return { ingreso, trasladado, total: ingreso.plus(trasladado) };
}
