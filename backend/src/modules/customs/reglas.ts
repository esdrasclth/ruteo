import { CustomsCategory, Prisma } from '@prisma/client';

/**
 * Qué regla aduanera aplica, y qué se liquida con ella.
 *
 * **Nada de esto está en el código como constante.** Los topes, las tasas y qué
 * documentos exige cada categoría salen de `CustomsRule`, que se versiona por
 * fechas. El motivo no es flexibilidad por gusto: cuando alguien pregunte dentro
 * de un año por qué se le cobró lo que se le cobró, la respuesta tiene que salir
 * de la regla que estaba vigente ESE día. Con las cifras en el código, la
 * respuesta sería la tarifa de hoy y el pasado quedaría reescrito.
 *
 * Va aparte del servicio y sin tocar la base a propósito: la regla de qué
 * categoría aplica es lo que hay que poder probar sin montar media base de datos
 * alrededor, igual que el cotejo de manifiestos.
 */

/** Lo mínimo de una regla para poder elegirla y liquidar con ella. */
export interface ReglaAplicable {
  id: string;
  country: string;
  category: CustomsCategory;
  maxValue: Prisma.Decimal | null;
  currency: string;
  requiresInvoice: boolean;
  requiresPermit: boolean;
  requiresBroker: boolean;
  dutyRate: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface ValorDeclarado {
  productValue?: Prisma.Decimal | number | null;
  freightAmount?: Prisma.Decimal | number | null;
  insuranceAmount?: Prisma.Decimal | number | null;
  otherCharges?: Prisma.Decimal | number | null;
}

const cero = () => new Prisma.Decimal(0);
const dec = (v: Prisma.Decimal | number | null | undefined) =>
  v == null ? cero() : new Prisma.Decimal(v);

/**
 * Valor aduanero: mercancía + flete + seguro + otros cargos.
 *
 * **No es el valor de compra**, y confundirlos es el error clásico: se liquida
 * sobre lo que costó poner la mercancía en la frontera, no sobre lo que decía la
 * factura de la tienda. Guardar solo el total haría imposible rehacer el cálculo
 * o discutirlo con el cliente, así que las cuatro piezas se conservan y esto
 * solo las suma.
 */
export function valorAduanero(v: ValorDeclarado): Prisma.Decimal {
  return dec(v.productValue)
    .plus(dec(v.freightAmount))
    .plus(dec(v.insuranceAmount))
    .plus(dec(v.otherCharges))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * ¿Estaba vigente esta regla en esa fecha?
 *
 * `effectiveTo` nulo significa «sigue vigente». El intervalo es cerrado por la
 * izquierda y abierto por la derecha: una regla que termina el día 1 y otra que
 * empieza el día 1 no se solapan, que es como se encadenan en la práctica.
 */
export function vigenteEn(regla: ReglaAplicable, fecha: Date): boolean {
  if (regla.effectiveFrom > fecha) return false;
  return regla.effectiveTo === null || regla.effectiveTo > fecha;
}

/**
 * La regla que aplica a un envío.
 *
 * Se elige la categoría **más barata que cubra el valor**: entre varias vigentes
 * para el mismo país, gana la de menor tope que todavía alcance. Con el orden al
 * revés, un sobre de documentos acabaría despachado como mercancía comercial.
 *
 * Sin tope (`maxValue` nulo) es el cajón de sastre —la categoría C— y solo se
 * usa cuando ninguna acotada alcanza.
 *
 * Devuelve `null` si no hay ninguna vigente: eso NO se resuelve inventando una
 * por defecto. Un envío sin regla es un envío que no se puede liquidar, y hay
 * que decirlo en vez de cobrar con cifras que nadie configuró.
 */
export function elegirRegla(
  reglas: ReglaAplicable[],
  country: string,
  valor: Prisma.Decimal,
  fecha: Date = new Date(),
): ReglaAplicable | null {
  const candidatas = reglas
    .filter((r) => r.country === country && vigenteEn(r, fecha))
    .filter((r) => r.maxValue === null || r.maxValue.gte(valor));

  if (candidatas.length === 0) return null;

  return candidatas.sort((a, b) => {
    // Las acotadas antes que las sin tope.
    if (a.maxValue === null) return 1;
    if (b.maxValue === null) return -1;
    if (!a.maxValue.eq(b.maxValue)) return a.maxValue.comparedTo(b.maxValue);
    // A igualdad de tope, la que empezó más tarde: es la corrección más
    // reciente de la misma norma.
    return b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
  })[0];
}

export interface Liquidacion {
  customsValue: Prisma.Decimal;
  dutyAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalCharges: Prisma.Decimal;
}

/**
 * Arancel e impuesto según la regla.
 *
 * El impuesto se calcula sobre valor + arancel, no sobre el valor a secas: es
 * como se liquida, y calcularlo sobre el valor pelado deja la liquidación corta.
 * `handlingFee` entra en el total pero NO en la base imponible: es un cargo de
 * la empresa, no un tributo.
 */
export function liquidar(
  regla: ReglaAplicable,
  valor: ValorDeclarado,
  handlingFee: Prisma.Decimal | number | null = null,
): Liquidacion {
  const customsValue = valorAduanero(valor);
  const dutyAmount = customsValue
    .mul(regla.dutyRate)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const taxAmount = customsValue
    .plus(dutyAmount)
    .mul(regla.taxRate)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  return {
    customsValue,
    dutyAmount,
    taxAmount,
    totalCharges: dutyAmount.plus(taxAmount).plus(dec(handlingFee)),
  };
}

/** Qué documentos exige la regla y cuáles faltan. */
export function documentosQueFaltan(
  regla: ReglaAplicable,
  presentes: { requiereFactura: boolean; requierePermiso: boolean },
): string[] {
  const faltan: string[] = [];
  if (regla.requiresInvoice && !presentes.requiereFactura) {
    faltan.push('factura comercial');
  }
  if (regla.requiresPermit && !presentes.requierePermiso) {
    faltan.push('permiso');
  }
  return faltan;
}
