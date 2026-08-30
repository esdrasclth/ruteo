import { BadRequestException } from '@nestjs/common';
import { DeliveryFailureReason, DeliveryOutcome, Prisma } from '@prisma/client';
import { RoutesService } from './routes.service';
import { describirFallo, MOTIVOS_DE_FALLO } from './motivo-fallo';

// Numerar los intentos es lo que separa «se intentó entregar» de «se fue tres
// veces y tres veces no había nadie». Si el número se calcula mal, el KPI de
// entregas al primer intento miente en la dirección cómoda: hacia arriba.

const ENVIO = '7d8e0000-0000-0000-0000-0000000000cc';

function servicio() {
  return new RoutesService({} as never, {} as never, {} as never);
}

function txConUltimoIntento(ultimo: number | null) {
  return {
    deliveryAttempt: {
      aggregate: jest.fn(() =>
        Promise.resolve({ _max: { attemptNumber: ultimo } }),
      ),
      create: jest.fn((args: { data: unknown }) => Promise.resolve(args.data)),
    },
  };
}

function registrar(tx: unknown, datos: Record<string, unknown>) {
  return (
    servicio() as unknown as {
      registrarIntento: (t: unknown, d: unknown) => Promise<unknown>;
    }
  ).registrarIntento(tx, datos);
}

function conNumero<T>(operacion: () => Promise<T>) {
  return (
    servicio() as unknown as {
      conNumeroDeIntento: (o: () => Promise<T>) => Promise<T>;
    }
  ).conNumeroDeIntento(operacion);
}

/** El error que lanza Prisma cuando dos intentos piden el mismo número. */
function colisionDeNumero() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['shipment_id', 'attempt_number'] },
  });
}

describe('registrarIntento', () => {
  it('el primer intento de un envío es el 1', async () => {
    const tx = txConUltimoIntento(null);
    const creado = (await registrar(tx, {
      shipmentId: ENVIO,
      outcome: DeliveryOutcome.SUCCESS,
    })) as { attemptNumber: number };
    expect(creado.attemptNumber).toBe(1);
  });

  it('el siguiente continúa la cuenta del envío', async () => {
    const tx = txConUltimoIntento(2);
    const creado = (await registrar(tx, {
      shipmentId: ENVIO,
      outcome: DeliveryOutcome.FAILED,
      failureReason: DeliveryFailureReason.NO_RECIPIENT,
    })) as { attemptNumber: number };
    expect(creado.attemptNumber).toBe(3);
  });

  // El caso que da sentido a toda la fase: un segundo intento NO pisa al
  // primero. Antes esto era un `upsert` sobre el POD de la parada y el primero
  // desaparecía, así que el historial que hay que enseñarle a un cliente que
  // reclama se perdía en el momento de generarse.
  it('no toca lo ya registrado: sólo inserta', async () => {
    const tx = txConUltimoIntento(1);
    await registrar(tx, {
      shipmentId: ENVIO,
      outcome: DeliveryOutcome.FAILED,
      failureReason: DeliveryFailureReason.BUSINESS_CLOSED,
    });
    expect(tx.deliveryAttempt.create).toHaveBeenCalledTimes(1);
    expect(tx.deliveryAttempt).not.toHaveProperty('update');
    expect(tx.deliveryAttempt).not.toHaveProperty('upsert');
  });

  // El número se cuenta por ENVÍO. Por parada valdría siempre 1 —una parada se
  // cierra una vez— y el KPI nacería diciendo que el 100% se entrega al primer
  // intento, que es peor que no tenerlo.
  it('cuenta por envío y no por parada', async () => {
    const tx = txConUltimoIntento(4);
    await registrar(tx, {
      shipmentId: ENVIO,
      outcome: DeliveryOutcome.SUCCESS,
    });
    expect(tx.deliveryAttempt.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shipmentId: ENVIO } }),
    );
  });
});

describe('conNumeroDeIntento', () => {
  it('reintenta cuando dos cierres pidieron el mismo número', async () => {
    let llamadas = 0;
    const resultado = await conNumero(() => {
      llamadas++;
      if (llamadas === 1) return Promise.reject(colisionDeNumero());
      return Promise.resolve('listo');
    });
    expect(resultado).toBe('listo');
    expect(llamadas).toBe(2);
  });

  it('se rinde en vez de reintentar para siempre', async () => {
    let llamadas = 0;
    await expect(
      conNumero(() => {
        llamadas++;
        return Promise.reject(colisionDeNumero());
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(llamadas).toBe(3);
  });

  // Reintentar cualquier P2002 convertiría un error claro —un código de ruta
  // repetido— en el mismo error tres veces más tarde.
  it('no reintenta una colisión que no es la del número', async () => {
    let llamadas = 0;
    const otra = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['tenant_id', 'code'] },
    });
    await expect(
      conNumero(() => {
        llamadas++;
        return Promise.reject(otra);
      }),
    ).rejects.toBe(otra);
    expect(llamadas).toBe(1);
  });

  it('deja pasar cualquier otro error tal cual', async () => {
    const roto = new Error('la base se cayó');
    await expect(conNumero(() => Promise.reject(roto))).rejects.toBe(roto);
  });
});

describe('describirFallo', () => {
  it('traduce el motivo a algo que se puede leer en el panel', () => {
    expect(describirFallo(DeliveryFailureReason.NO_RECIPIENT)).toBe(
      'No había quien recibiera',
    );
  });

  // La nota se suma a la etiqueta y no la sustituye: quien lee necesita a la vez
  // la categoría —que es lo que se cuenta— y el detalle de lo que pasó.
  it('conserva la categoría cuando hay nota', () => {
    const texto = describirFallo(
      DeliveryFailureReason.RESCHEDULED,
      'pasar el martes',
    );
    expect(texto).toBe('El cliente pidió otro día: pasar el martes');
  });

  it('todos los motivos tienen etiqueta', () => {
    for (const motivo of Object.values(DeliveryFailureReason)) {
      expect(MOTIVOS_DE_FALLO[motivo]).toBeTruthy();
    }
  });
});

describe('failStop con «Otro motivo»', () => {
  // Un OTHER sin explicación es el texto libre de antes con menos información:
  // no se puede revisar ni ascender a categoría propia. Se comprueba ANTES de
  // tocar nada, por eso este servicio sin base de datos ni almacenamiento
  // alcanza para probarlo.
  const usuario = { userId: null, tenantId: 'x', role: 'OPERATOR' } as never;

  it('exige la nota', async () => {
    await expect(
      servicio().failStop(usuario, 'r', 's', {
        failureReason: DeliveryFailureReason.OTHER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no se conforma con espacios en blanco', async () => {
    await expect(
      servicio().failStop(usuario, 'r', 's', {
        failureReason: DeliveryFailureReason.OTHER,
        notes: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
