import { ExceptionSeverity, ExceptionType, Prisma } from '@prisma/client';
import { cotejar, diferenciaDeTotales, TOLERANCIA_KG } from './cotejo';

// El cotejo es lo que convierte «llegó la carga» en «llegó la carga y esto es lo
// que falta». Un faltante que no se detecta al descargar se descubre cuando el
// cliente reclama, semanas después, cuando ya no hay a quién reclamarle.

const d = (n: string | number) => new Prisma.Decimal(n);

const linea = (id: string, pieces: number, kg: string | number) => ({
  shipmentId: id,
  trackingNumber: `RT-${id}`,
  pieces,
  weightKg: d(kg),
});

describe('cotejar', () => {
  it('cuando todo cuadra no levanta nada', () => {
    const res = cotejar(
      [linea('a', 2, 10), linea('b', 1, 5)],
      [
        { shipmentId: 'a', receivedPieces: 2, receivedWeightKg: d(10) },
        { shipmentId: 'b', receivedPieces: 1, receivedWeightKg: d(5) },
      ],
    );
    expect(res.cuadra).toBe(true);
    expect(res.diferencias).toHaveLength(0);
    expect(res.receivedPieces).toBe(3);
    expect(res.receivedWeightKg.toString()).toBe('15');
  });

  it('faltan bultos de una guía', () => {
    const res = cotejar(
      [linea('a', 3, 15)],
      [{ shipmentId: 'a', receivedPieces: 2, receivedWeightKg: d(10) }],
    );
    expect(res.cuadra).toBe(false);
    expect(res.diferencias[0]).toMatchObject({
      type: ExceptionType.MISSING,
      severity: ExceptionSeverity.MEDIUM,
      expectedValue: '3 bultos / 15 kg',
      actualValue: '2 bultos / 10 kg',
    });
  });

  // Que no llegue NADA de una guía es peor que que falte uno de tres: hay un
  // cliente entero sin su compra.
  it('una guía que no llegó en absoluto es de severidad alta', () => {
    const res = cotejar(
      [linea('a', 3, 15)],
      [{ shipmentId: 'a', receivedPieces: 0 }],
    );
    expect(res.diferencias[0].severity).toBe(ExceptionSeverity.HIGH);
  });

  // El caso que se olvida: una guía que ni aparece en el conteo. Tratarla como
  // «no cotejada» la dejaría fuera del recuento y el faltante desaparecería.
  it('una guía ausente del conteo cuenta como cero recibido, no como pendiente', () => {
    const res = cotejar([linea('a', 2, 10)], []);
    expect(res.receivedPieces).toBe(0);
    expect(res.diferencias).toHaveLength(1);
    expect(res.diferencias[0].type).toBe(ExceptionType.MISSING);
  });

  it('sobran bultos en una guía', () => {
    const res = cotejar(
      [linea('a', 1, 5)],
      [{ shipmentId: 'a', receivedPieces: 2, receivedWeightKg: d(9) }],
    );
    expect(res.diferencias[0].type).toBe(ExceptionType.OVERAGE);
  });

  // El sobrante más caro: no hay guía de la que tirar para saber de quién es.
  it('un envío que no estaba manifestado es sobrante de severidad alta', () => {
    const res = cotejar(
      [linea('a', 1, 5)],
      [
        { shipmentId: 'a', receivedPieces: 1, receivedWeightKg: d(5) },
        { shipmentId: 'intruso', receivedPieces: 1, receivedWeightKg: d(3) },
      ],
    );
    const sobrante = res.diferencias.find((x) => x.shipmentId === 'intruso');
    expect(sobrante).toMatchObject({
      type: ExceptionType.OVERAGE,
      severity: ExceptionSeverity.HIGH,
      expectedValue: 'no manifestado',
    });
    // Y suma a los totales: llegó, aunque nadie lo esperara.
    expect(res.receivedPieces).toBe(2);
    expect(res.receivedWeightKg.toString()).toBe('8');
  });

  // Sin tolerancia, TODA línea levantaría excepción: las básculas de Miami y de
  // Honduras nunca coinciden al gramo, y ciento cincuenta excepciones de veinte
  // gramos entierran las tres que importan.
  it('una diferencia de peso dentro de la tolerancia no levanta nada', () => {
    const res = cotejar(
      [linea('a', 1, 10)],
      [
        {
          shipmentId: 'a',
          receivedPieces: 1,
          receivedWeightKg: d(10).plus(TOLERANCIA_KG),
        },
      ],
    );
    expect(res.cuadra).toBe(true);
  });

  it('pasada la tolerancia sí, pero con severidad baja: es revisión, no pérdida', () => {
    const res = cotejar(
      [linea('a', 1, 10)],
      [{ shipmentId: 'a', receivedPieces: 1, receivedWeightKg: d(12) }],
    );
    expect(res.diferencias[0]).toMatchObject({
      type: ExceptionType.OVERWEIGHT,
      severity: ExceptionSeverity.LOW,
    });
  });

  it('bultos mal y peso mal generan UNA sola diferencia, la de bultos', () => {
    // Reportar las dos duplicaría el trabajo de quien las revisa: si faltan
    // bultos, que el peso no cuadre es la consecuencia, no otro problema.
    const res = cotejar(
      [linea('a', 3, 15)],
      [{ shipmentId: 'a', receivedPieces: 1, receivedWeightKg: d(5) }],
    );
    expect(res.diferencias).toHaveLength(1);
    expect(res.diferencias[0].type).toBe(ExceptionType.MISSING);
  });
});

describe('diferenciaDeTotales', () => {
  it('sin diferencias no hay excepción de manifiesto', () => {
    const res = cotejar(
      [linea('a', 2, 10)],
      [{ shipmentId: 'a', receivedPieces: 2, receivedWeightKg: d(10) }],
    );
    expect(diferenciaDeTotales(2, d(10), res)).toBeNull();
  });

  // Responde otra pregunta que las de línea: cuánto falta EN TOTAL. Quien
  // descarga necesita esto para decidir si acepta la carga.
  it('el 100 contra 99 del ejemplo clásico', () => {
    const res = cotejar(
      [linea('a', 100, 1000)],
      [{ shipmentId: 'a', receivedPieces: 99, receivedWeightKg: d(990) }],
    );
    expect(diferenciaDeTotales(100, d(1000), res)).toMatchObject({
      type: ExceptionType.MANIFEST_MISMATCH,
      severity: ExceptionSeverity.HIGH,
      expectedValue: '100 bultos / 1000 kg',
      actualValue: '99 bultos / 990 kg',
    });
  });
});
