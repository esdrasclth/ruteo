import { Prisma } from '@prisma/client';
import { IdempotencyService } from './idempotency.service';

// La caducidad tiene dos caras y las dos importan: sin ella la tabla crece para
// siempre guardando el cuerpo de cada respuesta, y si al caducar no se libera
// la clave, un cliente que reutiliza la suya queda bloqueado hasta la purga.

const P2002 = new Prisma.PrismaClientKnownRequestError('unique', {
  code: 'P2002',
  clientVersion: 'test',
});

function montar(existente: Record<string, unknown> | null) {
  const create = jest.fn();
  if (existente) create.mockRejectedValue(P2002);
  else create.mockResolvedValue({});

  const tx = {
    idempotencyKey: {
      create,
      findUnique: jest.fn().mockResolvedValue(existente),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    withTenant: <T>(_t: string, cb: (tx: unknown) => Promise<T>) => cb(tx),
    $queryRaw: jest.fn().mockResolvedValue([{ purgar_idempotencia: 3 }]),
  };
  return {
    servicio: new IdempotencyService(prisma as never),
    tx,
    prisma,
  };
}

const dentroDeUnaHora = () => new Date(Date.now() + 3_600_000);
const haceUnaHora = () => new Date(Date.now() - 3_600_000);

describe('IdempotencyService.begin', () => {
  it('una clave nueva se reserva con caducidad', async () => {
    const { servicio, tx } = montar(null);

    await expect(servicio.begin('t1', 'k1', 'POST /x')).resolves.toEqual({
      state: 'new',
    });

    const [[argumentos]] = tx.idempotencyKey.create.mock.calls as [
      [{ data: { expiresAt: Date } }],
    ];
    const datos = argumentos.data;
    expect(datos.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('reproduce la respuesta de una clave vigente ya completada', async () => {
    const { servicio } = montar({
      id: 'i1',
      endpoint: 'POST /x',
      responseStatus: 201,
      responseBody: { ok: true },
      expiresAt: dentroDeUnaHora(),
    });

    await expect(servicio.begin('t1', 'k1', 'POST /x')).resolves.toEqual({
      state: 'replay',
      status: 201,
      body: { ok: true },
    });
  });

  it('una clave vigente en curso da in_progress', async () => {
    const { servicio } = montar({
      id: 'i1',
      endpoint: 'POST /x',
      responseStatus: null,
      expiresAt: dentroDeUnaHora(),
    });

    await expect(servicio.begin('t1', 'k1', 'POST /x')).resolves.toEqual({
      state: 'in_progress',
    });
  });

  it('la misma clave en otro endpoint es conflicto', async () => {
    const { servicio } = montar({
      id: 'i1',
      endpoint: 'POST /otro',
      responseStatus: 201,
      expiresAt: dentroDeUnaHora(),
    });

    await expect(servicio.begin('t1', 'k1', 'POST /x')).resolves.toEqual({
      state: 'conflict',
    });
  });

  describe('cuando la clave ya venció', () => {
    // Sin esto, entre purga y purga una clave caducada seguiría reproduciendo
    // una respuesta vieja —o peor, bloqueando como conflicto— a un cliente que
    // la reutiliza con todo el derecho.
    it('la trata como nueva aunque tuviera respuesta guardada', async () => {
      const { servicio } = montar({
        id: 'i1',
        endpoint: 'POST /x',
        responseStatus: 201,
        responseBody: { ok: true },
        expiresAt: haceUnaHora(),
      });

      await expect(servicio.begin('t1', 'k1', 'POST /x')).resolves.toEqual({
        state: 'new',
      });
    });

    it('la reutiliza en vez de borrarla, para no abrir una carrera', async () => {
      const { servicio, tx } = montar({
        id: 'i1',
        endpoint: 'POST /viejo',
        responseStatus: 500,
        expiresAt: haceUnaHora(),
      });

      await servicio.begin('t1', 'k1', 'POST /nuevo');

      expect(tx.idempotencyKey.deleteMany).not.toHaveBeenCalled();
      const [[argumentos]] = tx.idempotencyKey.update.mock.calls as [
        [{ data: { endpoint: string; responseStatus: number | null } }],
      ];
      const datos = argumentos.data;
      // Y se queda con el endpoint nuevo y sin la respuesta vieja.
      expect(datos.endpoint).toBe('POST /nuevo');
      expect(datos.responseStatus).toBeNull();
    });

    // Vencida y en otro endpoint: manda la caducidad, no el conflicto.
    it('no la marca como conflicto', async () => {
      const { servicio } = montar({
        id: 'i1',
        endpoint: 'POST /otro',
        responseStatus: 201,
        expiresAt: haceUnaHora(),
      });

      await expect(servicio.begin('t1', 'k1', 'POST /x')).resolves.toEqual({
        state: 'new',
      });
    });
  });
});

describe('IdempotencyService.purgarVencidas', () => {
  // Va por una función SECURITY DEFINER porque el rol de la aplicación es
  // NOBYPASSRLS: un `deleteMany` sin contexto de tenant no borra nada.
  it('devuelve cuántas borró', async () => {
    const { servicio } = montar(null);
    await expect(servicio.purgarVencidas()).resolves.toBe(3);
  });

  it('tolera que la consulta no devuelva filas', async () => {
    const { servicio, prisma } = montar(null);
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(servicio.purgarVencidas()).resolves.toBe(0);
  });
});
