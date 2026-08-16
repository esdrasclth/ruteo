import {
  EventVisibility,
  Prisma,
  ShipmentEventType,
  ShipmentStatus,
} from '@prisma/client';
import { registrar, VISIBILIDAD_POR_DEFECTO } from './eventos';

// Doble de la transacción: interesa QUÉ fila se manda a escribir, que es donde
// están las decisiones. La escritura en sí ya la prueban las e2e.
function txFalso() {
  const creados: Prisma.ShipmentEventCreateArgs['data'][] = [];
  const tx = {
    shipmentEvent: {
      create: (args: Prisma.ShipmentEventCreateArgs) => {
        creados.push(args.data);
        return Promise.resolve({ id: 'ev-1' });
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, creados };
}

const base = { tenantId: 't-1', shipmentId: 's-1' };

describe('registrar', () => {
  it('un cambio de estado conserva su estado', async () => {
    const { tx, creados } = txFalso();
    await registrar(tx, {
      ...base,
      tipo: ShipmentEventType.STATUS_CHANGED,
      status: ShipmentStatus.DELIVERED,
    });
    expect(creados[0].status).toBe(ShipmentStatus.DELIVERED);
    expect(creados[0].eventType).toBe(ShipmentEventType.STATUS_CHANGED);
  });

  // Si un evento que no es de estado guardara uno, cualquier consulta que
  // agrupe por estado lo contaria como si el envio hubiera avanzado.
  it('descarta el estado en los eventos que no lo son', async () => {
    const { tx, creados } = txFalso();
    await registrar(tx, {
      ...base,
      tipo: ShipmentEventType.DOCUMENT_VERIFIED,
      status: ShipmentStatus.DELIVERED,
    });
    expect(creados[0].status).toBeNull();
  });

  it('aplica la visibilidad por defecto del tipo', async () => {
    const { tx, creados } = txFalso();
    await registrar(tx, { ...base, tipo: ShipmentEventType.CHARGE_ADDED });
    expect(creados[0].visibility).toBe(EventVisibility.INTERNAL);

    await registrar(tx, { ...base, tipo: ShipmentEventType.CUSTOMS_CLEARED });
    expect(creados[1].visibility).toBe(EventVisibility.PUBLIC);
  });

  // Una nota se escribe a veces precisamente para que el cliente la lea.
  it('la visibilidad explicita gana al defecto', async () => {
    const { tx, creados } = txFalso();
    await registrar(tx, {
      ...base,
      tipo: ShipmentEventType.NOTE,
      visibility: EventVisibility.PUBLIC,
    });
    expect(creados[0].visibility).toBe(EventVisibility.PUBLIC);
  });

  it('guarda las cifras del hecho en metadata', async () => {
    const { tx, creados } = txFalso();
    await registrar(tx, {
      ...base,
      tipo: ShipmentEventType.CHARGE_COLLECTED,
      metadata: { amount: '135.63', currency: 'USD' },
    });
    expect(creados[0].metadata).toEqual({ amount: '135.63', currency: 'USD' });
  });
});

describe('VISIBILIDAD_POR_DEFECTO', () => {
  // Un tipo sin entrada dejaria el evento con visibilidad `undefined`, que en la
  // base cae en el default INTERNAL sin que nadie lo haya decidido.
  it('cubre todos los tipos de evento', () => {
    for (const tipo of Object.values(ShipmentEventType)) {
      expect(VISIBILIDAD_POR_DEFECTO[tipo]).toBeDefined();
    }
  });

  // Lo interno es lo que se equivoca barato: publicar de mas no se deshace.
  it('solo son publicos los hitos que el cliente preguntaria por telefono', () => {
    const publicos = Object.entries(VISIBILIDAD_POR_DEFECTO)
      .filter(([, v]) => v === EventVisibility.PUBLIC)
      .map(([t]) => t)
      .sort();
    // La lista se escribe entera y a mano a proposito: hacer publico un tipo
    // nuevo tiene que obligar a pasar por aqui. Los cinco de posventa entraron
    // con la fase 6 y son publicos porque el cliente es parte de esos hechos
    // —abrio el reclamo, su paquete volvio, le devolvieron dinero—, al reves
    // que las excepciones, que son diagnostico interno.
    expect(publicos).toEqual([
      'CHARGE_COLLECTED',
      'CLAIM_OPENED',
      'CLAIM_RESOLVED',
      'CUSTOMS_ASSESSED',
      'CUSTOMS_CLEARED',
      'REFUND_ISSUED',
      'RETURN_COMPLETED',
      'RETURN_STARTED',
      'STATUS_CHANGED',
    ]);
  });
});
