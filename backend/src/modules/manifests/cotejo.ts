import { ExceptionSeverity, ExceptionType, Prisma } from '@prisma/client';

/**
 * Cotejo: lo declarado en el manifiesto contra lo que llegó de verdad.
 *
 * Aduanas exige contrastar bultos y kilos manifestados contra los recibidos
 * físicamente y registrar las diferencias. Pero antes que un requisito es una
 * necesidad operativa: un faltante que no se detecta al descargar se descubre
 * cuando el cliente reclama, semanas después, cuando ya no hay a quién
 * reclamarle a su vez.
 *
 * **La diferencia no se anota en una nota de texto: genera una excepción.** Una
 * nota no se puede contar, ni asignar, ni cerrar. Lo primero que se pregunta al
 * final del mes es cuántos faltantes hubo y cuánto costaron, y eso solo se
 * responde si cada uno es una fila.
 *
 * Esta función es pura a propósito —decide qué excepciones hay que crear, sin
 * tocar la base—: la regla de cuándo algo es un faltante es lo que hay que poder
 * probar sin montar media base de datos alrededor.
 */

/** Lo que dice el manifiesto de una guía. */
export interface LineaDeclarada {
  shipmentId: string;
  /** Para poder describir la excepción sin volver a consultar. */
  trackingNumber?: string;
  pieces: number;
  weightKg: Prisma.Decimal;
}

/** Lo que se contó al descargar. */
export interface LineaContada {
  shipmentId: string;
  receivedPieces: number;
  receivedWeightKg?: Prisma.Decimal | null;
}

export interface DiferenciaDeLinea {
  shipmentId: string;
  trackingNumber?: string;
  type: ExceptionType;
  severity: ExceptionSeverity;
  description: string;
  expectedValue: string;
  actualValue: string;
}

export interface ResultadoDeCotejo {
  /** Totales de lo que se contó, para guardarlos en el manifiesto. */
  receivedPieces: number;
  receivedWeightKg: Prisma.Decimal;
  /** Una por línea que no cuadra, más una del manifiesto si el total no cuadra. */
  diferencias: DiferenciaDeLinea[];
  cuadra: boolean;
}

/**
 * Tolerancia de peso, en kilos.
 *
 * Sin margen, TODA línea generaría una excepción: la báscula de Miami y la de
 * Honduras nunca coinciden al gramo, y una lista de ciento cincuenta excepciones
 * de veinte gramos entierra las tres que importan. Medio kilo es lo que
 * distingue «pesa distinto» de «falta algo dentro».
 */
export const TOLERANCIA_KG = new Prisma.Decimal('0.5');

function describir(pieces: number, peso: Prisma.Decimal | null | undefined) {
  const kg = peso ? ` / ${peso.toString()} kg` : '';
  return `${pieces} bulto${pieces === 1 ? '' : 's'}${kg}`;
}

export function cotejar(
  declaradas: LineaDeclarada[],
  contadas: LineaContada[],
): ResultadoDeCotejo {
  const porEnvio = new Map(contadas.map((c) => [c.shipmentId, c]));
  const diferencias: DiferenciaDeLinea[] = [];

  let receivedPieces = 0;
  let receivedWeightKg = new Prisma.Decimal(0);
  let declaredWeightKg = new Prisma.Decimal(0);

  for (const linea of declaradas) {
    declaredWeightKg = declaredWeightKg.plus(linea.weightKg);

    // Una guía que ni siquiera aparece en el conteo cuenta como cero recibido,
    // no como «no cotejada». Tratarla como pendiente la dejaría fuera del
    // recuento y el faltante desaparecería del informe.
    const contada = porEnvio.get(linea.shipmentId);
    const piezas = contada?.receivedPieces ?? 0;
    const peso = contada?.receivedWeightKg ?? null;

    receivedPieces += piezas;
    if (peso) receivedWeightKg = receivedWeightKg.plus(peso);

    if (piezas < linea.pieces) {
      diferencias.push({
        shipmentId: linea.shipmentId,
        trackingNumber: linea.trackingNumber,
        type: ExceptionType.MISSING,
        // Que no llegue nada de una guía es peor que que falte un bulto de
        // tres: en el primer caso hay un cliente entero sin su compra.
        severity:
          piezas === 0 ? ExceptionSeverity.HIGH : ExceptionSeverity.MEDIUM,
        description: `Faltan bultos de la guía ${linea.trackingNumber ?? linea.shipmentId}`,
        expectedValue: describir(linea.pieces, linea.weightKg),
        actualValue: describir(piezas, peso),
      });
      continue;
    }

    if (piezas > linea.pieces) {
      diferencias.push({
        shipmentId: linea.shipmentId,
        trackingNumber: linea.trackingNumber,
        type: ExceptionType.OVERAGE,
        severity: ExceptionSeverity.MEDIUM,
        description: `Sobran bultos en la guía ${linea.trackingNumber ?? linea.shipmentId}`,
        expectedValue: describir(linea.pieces, linea.weightKg),
        actualValue: describir(piezas, peso),
      });
      continue;
    }

    // Bultos correctos pero peso distinto: puede ser la báscula, o puede ser
    // que la caja llegó abierta y con menos dentro. Por eso se levanta, pero
    // con severidad baja: es una revisión, no una pérdida confirmada.
    if (peso && peso.minus(linea.weightKg).abs().gt(TOLERANCIA_KG)) {
      diferencias.push({
        shipmentId: linea.shipmentId,
        trackingNumber: linea.trackingNumber,
        type: ExceptionType.OVERWEIGHT,
        severity: ExceptionSeverity.LOW,
        description: `El peso recibido no coincide con el manifestado en la guía ${
          linea.trackingNumber ?? linea.shipmentId
        }`,
        expectedValue: describir(linea.pieces, linea.weightKg),
        actualValue: describir(piezas, peso),
      });
    }
  }

  // Bultos contados que no estaban en el manifiesto: alguien tiene una caja sin
  // dueño. Es el sobrante más caro de resolver, porque no hay guía de la que
  // tirar.
  for (const contada of contadas) {
    if (!declaradas.some((d) => d.shipmentId === contada.shipmentId)) {
      receivedPieces += contada.receivedPieces;
      if (contada.receivedWeightKg) {
        receivedWeightKg = receivedWeightKg.plus(contada.receivedWeightKg);
      }
      diferencias.push({
        shipmentId: contada.shipmentId,
        type: ExceptionType.OVERAGE,
        severity: ExceptionSeverity.HIGH,
        description: 'Llegó un envío que no estaba manifestado',
        expectedValue: 'no manifestado',
        actualValue: describir(
          contada.receivedPieces,
          contada.receivedWeightKg,
        ),
      });
    }
  }

  return {
    receivedPieces,
    receivedWeightKg,
    diferencias,
    cuadra: diferencias.length === 0,
  };
}

/**
 * La excepción del manifiesto entero, cuando los totales no cuadran.
 *
 * Va aparte de las de línea porque responde otra pregunta: las de línea dicen
 * qué guía falta, esta dice cuánto falta en total. Quien descarga necesita la
 * segunda para decidir si acepta la carga; quien reclama necesita la primera.
 */
export function diferenciaDeTotales(
  declaredPieces: number,
  declaredWeightKg: Prisma.Decimal,
  resultado: ResultadoDeCotejo,
): Omit<DiferenciaDeLinea, 'shipmentId' | 'trackingNumber'> | null {
  const piezasCuadran = declaredPieces === resultado.receivedPieces;
  const pesoCuadra = resultado.receivedWeightKg
    .minus(declaredWeightKg)
    .abs()
    .lte(TOLERANCIA_KG);
  if (piezasCuadran && pesoCuadra) return null;

  return {
    type: ExceptionType.MANIFEST_MISMATCH,
    severity: ExceptionSeverity.HIGH,
    description: 'Lo recibido no cuadra con lo manifestado',
    expectedValue: describir(declaredPieces, declaredWeightKg),
    actualValue: describir(
      resultado.receivedPieces,
      resultado.receivedWeightKg,
    ),
  };
}
