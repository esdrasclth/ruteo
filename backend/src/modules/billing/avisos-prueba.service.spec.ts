import { AvisosPruebaService } from './avisos-prueba.service';

// El aviso tiene una sola regla dura: se manda UNA vez. El trabajo corre cada
// doce horas y la ventana es de tres días, así que sin la marca de "ya avisado"
// una misma prueba generaría seis correos. Un aviso repetido no avisa mejor:
// entrena a la gente a ignorarlo.

interface Fila {
  out_tenant_id: string;
  out_tenant_name: string;
  out_slug: string;
  out_plan: string;
  out_period_end: Date;
  out_email: string | null;
}

function montar(filas: Fila[], opciones: { envioFalla?: boolean } = {}) {
  const marcados: string[] = [];
  const notificaciones: Record<string, unknown>[] = [];
  const enviados: { recipient: string; title: string | null }[] = [];

  const tx = {
    subscription: {
      update: jest.fn(({ where }: { where: { tenantId: string } }) => {
        marcados.push(where.tenantId);
        return Promise.resolve({});
      }),
    },
    notification: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        notificaciones.push(data);
        return Promise.resolve(data);
      }),
    },
  };

  const prisma = {
    $queryRaw: jest.fn(() => Promise.resolve(filas)),
    withTenant: <T>(_t: string, cb: (t: typeof tx) => Promise<T>) => cb(tx),
  };

  const notificador = {
    name: 'prueba',
    send: jest.fn((m: { recipient: string; title: string | null }) => {
      enviados.push(m);
      return Promise.resolve(
        opciones.envioFalla
          ? { ok: false, error: 'buzón inexistente' }
          : { ok: true },
      );
    }),
  };

  const servicio = new AvisosPruebaService(
    prisma as never,
    { get: () => 'https://{slug}.ruteo.brandsofts.com' } as never,
    notificador,
  );

  return { servicio, marcados, notificaciones, enviados };
}

function fila(parcial: Partial<Fila> = {}): Fila {
  return {
    out_tenant_id: 't1',
    out_tenant_name: 'Aviotech',
    out_slug: 'aviotech',
    out_plan: 'PRO',
    out_period_end: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    out_email: 'dueno@aviotech.com',
    ...parcial,
  };
}

describe('AvisosPruebaService', () => {
  it('avisa y marca la prueba como avisada', async () => {
    const { servicio, marcados, enviados } = montar([fila()]);

    await expect(servicio.avisarPruebasPorVencer()).resolves.toBe(1);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].recipient).toBe('dueno@aviotech.com');
    expect(marcados).toEqual(['t1']);
  });

  it('el asunto dice cuántos días quedan', async () => {
    const { servicio, enviados } = montar([
      fila({ out_period_end: new Date(Date.now() + 24 * 60 * 60 * 1000) }),
    ]);

    await servicio.avisarPruebasPorVencer();
    expect(enviados[0].title).toContain('1 día');
    expect(enviados[0].title).not.toContain('1 días');
  });

  // Lo que evita el bombardeo. La consulta ya excluye las avisadas, pero la
  // marca tiene que escribirse SIEMPRE o la exclusión nunca llega a aplicar.
  it('marca aunque el envío falle, para no reintentar cada doce horas', async () => {
    const { servicio, marcados, notificaciones } = montar([fila()], {
      envioFalla: true,
    });

    await expect(servicio.avisarPruebasPorVencer()).resolves.toBe(0);
    expect(marcados).toEqual(['t1']);
    // Y queda registrado como fallido, para que «no me llegó» se investigue.
    expect(notificaciones[0]).toMatchObject({
      status: 'FAILED',
      type: 'trial.expiring',
    });
  });

  it('sin destinatario no manda nada, pero marca igual', async () => {
    const { servicio, marcados, enviados } = montar([
      fila({ out_email: null }),
    ]);

    await expect(servicio.avisarPruebasPorVencer()).resolves.toBe(0);
    expect(enviados).toHaveLength(0);
    expect(marcados).toEqual(['t1']);
  });

  it('el correo lleva el enlace al panel de ESA empresa', async () => {
    const { servicio, notificaciones } = montar([fila({ out_slug: 'envios' })]);

    await servicio.avisarPruebasPorVencer();
    expect(notificaciones[0].body).toContain(
      'https://envios.ruteo.brandsofts.com/billing',
    );
  });

  it('sin pruebas por vencer no hace nada', async () => {
    const { servicio, enviados, marcados } = montar([]);

    await expect(servicio.avisarPruebasPorVencer()).resolves.toBe(0);
    expect(enviados).toHaveLength(0);
    expect(marcados).toHaveLength(0);
  });
});
