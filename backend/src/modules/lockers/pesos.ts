import { Prisma } from '@prisma/client';

/**
 * Peso volumétrico y peso cobrable.
 *
 * Un courier no cobra por lo que pesa un paquete, cobra por lo que ocupa en el
 * avión. Una caja de almohadas pesa dos kilos y llena medio pallet: cobrarla por
 * peso real es regalar el flete. Por eso se calcula un peso equivalente al
 * volumen y se cobra el mayor de los dos.
 *
 * **Los tres pesos se guardan.** No es redundancia:
 *
 *  - el REAL es lo que factura la aerolínea;
 *  - el VOLUMÉTRICO es lo que se le enseña al cliente que llama diciendo que su
 *    paquete pesa dos kilos y le cobraron ocho;
 *  - el COBRABLE es el que se usa, y se congela al recibir.
 *
 * Guardar solo el cobrable ahorra dos columnas y hace imposible explicar una
 * factura, que es la conversación más cara que tiene una bodega.
 */

/**
 * Divisor por defecto: el habitual en carga aérea. Es solo el valor inicial de
 * `Tenant.volumetricDivisor`; el que manda es el del tenant, porque cambia por
 * courier y por acuerdo comercial.
 */
export const DIVISOR_POR_DEFECTO = 5000;

export interface Dimensiones {
  lengthCm?: Prisma.Decimal | number | null;
  widthCm?: Prisma.Decimal | number | null;
  heightCm?: Prisma.Decimal | number | null;
}

export interface PesosCalculados {
  volumetricWeightKg: Prisma.Decimal | null;
  chargeableWeightKg: Prisma.Decimal | null;
}

/**
 * `largo × ancho × alto / divisor`, con las tres medidas en centímetros.
 *
 * `null` si falta alguna: con dos de tres no se puede calcular un volumen, y
 * asumir la que falta produciría un cobro inventado. Mejor no tener el dato que
 * tenerlo mal.
 */
export function pesoVolumetrico(
  dim: Dimensiones,
  divisor: number = DIVISOR_POR_DEFECTO,
): Prisma.Decimal | null {
  const { lengthCm, widthCm, heightCm } = dim;
  if (lengthCm == null || widthCm == null || heightCm == null) return null;

  const l = new Prisma.Decimal(lengthCm);
  const w = new Prisma.Decimal(widthCm);
  const h = new Prisma.Decimal(heightCm);
  if (l.lte(0) || w.lte(0) || h.lte(0)) return null;

  // Un divisor de cero o negativo daría infinito o un peso negativo. Se cae al
  // valor por defecto en vez de propagar el disparate: el dato viene de una
  // columna configurable y una configuración mala no debe convertirse en una
  // factura mala.
  const d = divisor > 0 ? divisor : DIVISOR_POR_DEFECTO;

  // Tres decimales, que es la precisión de la columna. Sin redondear aquí, el
  // valor que se compara contra el peso real no sería el que se guarda.
  return l.mul(w).mul(h).div(d).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * El mayor entre el real y el volumétrico.
 *
 * Si solo hay uno, ese. Si no hay ninguno, `null`: cobrar cero por no haber
 * medido sería peor que dejarlo pendiente y que alguien lo vea.
 */
export function pesoCobrable(
  real: Prisma.Decimal | number | null | undefined,
  volumetrico: Prisma.Decimal | null,
): Prisma.Decimal | null {
  const r = real == null ? null : new Prisma.Decimal(real);
  if (r === null) return volumetrico;
  if (volumetrico === null) return r;
  return r.gte(volumetrico) ? r : volumetrico;
}

/** Los dos de golpe, que es como se usan al recibir un bulto. */
export function calcularPesos(
  real: Prisma.Decimal | number | null | undefined,
  dim: Dimensiones,
  divisor?: number,
): PesosCalculados {
  const volumetricWeightKg = pesoVolumetrico(dim, divisor);
  return {
    volumetricWeightKg,
    chargeableWeightKg: pesoCobrable(real, volumetricWeightKg),
  };
}
