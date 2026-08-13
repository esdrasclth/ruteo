import { ChargeKind, ChargeStatus, Prisma } from '@prisma/client';
import { totalizar, Totales } from '../customs/cargos';

/**
 * Las cuentas de los cargos: qué se debe, qué se cobró y de quién es.
 *
 * Va aparte del servicio porque es la regla que hay que poder probar sin montar
 * media base de datos alrededor: de aquí sale tanto el cierre de mes como el
 * bloqueo que impide liberar un envío que no se ha pagado.
 */

export interface CargoDeSaldo {
  status: ChargeStatus;
  kind: ChargeKind;
  amount: Prisma.Decimal;
}

const CERO = new Prisma.Decimal(0);

function suma(cargos: { amount: Prisma.Decimal }[]): Prisma.Decimal {
  return cargos.reduce((total, c) => total.plus(c.amount), CERO);
}

/**
 * Un cargo anulado no es dinero.
 *
 * No se borra —que existió y se anuló es información— pero no puede sumar en
 * ningún recuento: contarlo inflaría los ingresos con cobros que nadie hizo, y
 * dejaría envíos bloqueados para siempre por un saldo que ya no se debe.
 */
function vigentes<T extends { status: ChargeStatus }>(cargos: T[]): T[] {
  return cargos.filter((c) => c.status !== ChargeStatus.VOID);
}

/** Lo que todavía se debe. Es el saldo que bloquea la liberación de aduana. */
export function saldoPendiente(cargos: CargoDeSaldo[]): Prisma.Decimal {
  return suma(cargos.filter((c) => c.status === ChargeStatus.PENDING));
}

export interface Desglose extends Totales {
  /** Ya cobrado, tenga o no pago asociado. */
  cobrado: Prisma.Decimal;
  /** Emitido y sin cobrar. */
  pendiente: Prisma.Decimal;
}

/**
 * La pregunta del cierre de mes: cuánto de lo cobrado es ingreso propio y
 * cuánto es tributo que solo se está trasladando.
 *
 * `total` es lo emitido (cobrado + pendiente), no lo ingresado: son dos cifras
 * distintas y confundirlas es lo que hace que una empresa crea que ganó lo que
 * todavía le deben.
 */
export function desglosar(cargos: CargoDeSaldo[]): Desglose {
  const cuentan = vigentes(cargos);
  return {
    ...totalizar(cuentan),
    cobrado: suma(cuentan.filter((c) => c.status === ChargeStatus.PAID)),
    pendiente: saldoPendiente(cuentan),
  };
}

/**
 * Por qué no se puede liberar este envío de aduana, o `null` si sí se puede.
 *
 * **Los dos motivos se dicen juntos a propósito.** Avisar de la factura que
 * falta, y solo después de subirla avisar de que además hay saldo, son dos
 * viajes al mostrador para el mismo trámite.
 */
export function motivosParaNoLiberar(entrada: {
  faltanDocumentos: string[];
  saldo: Prisma.Decimal;
  moneda: string;
}): string | null {
  const motivos: string[] = [];
  if (entrada.faltanDocumentos.length > 0) {
    motivos.push(`falta ${entrada.faltanDocumentos.join(', ')}`);
  }
  if (entrada.saldo.gt(0)) {
    // Mismo criterio que el documental: entregar la mercancía con el cobro
    // pendiente es quedarse sin la palanca para cobrarlo.
    motivos.push(
      `quedan ${entrada.saldo.toFixed(2)} ${entrada.moneda} sin cobrar`,
    );
  }
  if (motivos.length === 0) return null;
  return `No se puede liberar: ${motivos.join(' y ')}.`;
}
