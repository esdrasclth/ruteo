import { ForbiddenException } from '@nestjs/common';
import { Plan, SubscriptionStatus } from '@prisma/client';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { BillingService } from './billing.service';
import type { BillingProvider } from './billing-provider';

// `subscribe` es lo que decide el plan efectivo de una empresa, y el plan
// decide qué módulos ve y cuántos envíos puede crear. Si esto se afloja, todo
// el sistema de planes —`@Modulo` incluido— se sortea con una petición.

/** Ficha fiscal completa; es el caso normal de una empresa que ya contrató. */
const FISCALES_COMPLETOS = {
  legalName: 'Aviotech S. de R.L.',
  taxId: '08019995123456',
  billingEmail: 'facturacion@aviotech.com',
  billingAddress: 'Col. Palmira, Tegucigalpa',
};

function montar(opciones: {
  cobra: boolean;
  planActual: Plan;
  /** Lo que hay en la ficha fiscal. Por defecto, completa. */
  fiscales?: Partial<typeof FISCALES_COMPLETOS>;
}) {
  const tenantUpdate = jest.fn().mockResolvedValue({});
  const tx = {
    tenant: {
      // Devuelve plan Y datos fiscales: `subscribe` consulta el tenant dos
      // veces —para el plan actual y para exigir la ficha— y este doble
      // responde a las dos con el mismo objeto.
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        plan: opciones.planActual,
        ...FISCALES_COMPLETOS,
        ...opciones.fiscales,
      }),
      update: tenantUpdate,
    },
    subscription: {
      upsert: jest.fn().mockResolvedValue({ id: 's1' }),
    },
    payment: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    withTenant: <T>(_t: string, cb: (tx: unknown) => Promise<T>) => cb(tx),
  };

  // El mock se guarda aparte y no se lee luego como `provider.startSubscription`:
  // referenciar un metodo a traves del objeto lo desliga de su `this`.
  const inicioSuscripcion = jest.fn().mockResolvedValue({
    providerRef: null,
    status: SubscriptionStatus.ACTIVE,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(),
  });

  const provider: BillingProvider = {
    name: 'prueba',
    cobra: opciones.cobra,
    startSubscription: inicioSuscripcion,
    cancelSubscription: jest.fn(),
  };

  const servicio = new BillingService(
    prisma as never,
    { createSubscriptionInTx: jest.fn() } as never,
    { dispatch: jest.fn() } as never,
    provider,
  );

  return { servicio, inicioSuscripcion, tenantUpdate };
}

const actor = { userId: 'u1', tenantId: 't1', role: 'OWNER' } as AuthUser;

describe('BillingService.subscribe — datos fiscales', () => {
  // Se exigen aquí y NO en el alta: nadie necesita un RTN para rastrear un
  // paquete, y pedirlo en el registro solo consigue que menos gente lo termine.
  // Este es el momento en que de verdad hacen falta.
  it('no deja contratar un plan de pago con la ficha fiscal incompleta', async () => {
    const { servicio, inicioSuscripcion } = montar({
      cobra: true,
      planActual: Plan.FREE,
      fiscales: { taxId: null as unknown as string, billingAddress: '' },
    });

    await expect(
      servicio.subscribe(actor, { plan: Plan.STARTER }),
    ).rejects.toThrow(/RTN.*dirección fiscal|dirección fiscal.*RTN/);
    expect(inicioSuscripcion).not.toHaveBeenCalled();
  });

  it('con la ficha completa, contrata', async () => {
    const { servicio, inicioSuscripcion } = montar({
      cobra: true,
      planActual: Plan.FREE,
    });

    await servicio.subscribe(actor, { plan: Plan.STARTER });
    expect(inicioSuscripcion).toHaveBeenCalled();
  });

  // Bajar a FREE no cuesta dinero, así que no hay factura que emitir. Exigir la
  // ficha aquí dejaría atrapada en un plan de pago a una empresa que solo
  // quiere dejar de pagarlo.
  it('bajar a FREE no exige ficha fiscal', async () => {
    const { servicio, inicioSuscripcion } = montar({
      cobra: true,
      planActual: Plan.PRO,
      fiscales: { taxId: null as unknown as string },
    });

    await servicio.subscribe(actor, { plan: Plan.FREE });
    expect(inicioSuscripcion).toHaveBeenCalled();
  });
});

describe('BillingService.subscribe', () => {
  describe('con un proveedor que no cobra (el de hoy)', () => {
    // El agujero: una petición y te llevas los catorce módulos y envíos sin
    // tope, gratis.
    it.each([
      [Plan.FREE, Plan.ENTERPRISE],
      [Plan.FREE, Plan.STARTER],
      [Plan.STARTER, Plan.PRO],
    ])('niega subir de %s a %s', async (planActual, destino) => {
      const { servicio, inicioSuscripcion, tenantUpdate } = montar({
        cobra: false,
        planActual,
      });

      await expect(
        servicio.subscribe(actor, { plan: destino }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // Y no llega ni a tocar al proveedor ni a la fila del tenant.
      expect(inicioSuscripcion).not.toHaveBeenCalled();
      expect(tenantUpdate).not.toHaveBeenCalled();
    });

    it('deja BAJAR de plan: quien deja de pagar no pide permiso', async () => {
      const { servicio, tenantUpdate } = montar({
        cobra: false,
        planActual: Plan.ENTERPRISE,
      });

      await servicio.subscribe(actor, { plan: Plan.FREE });

      expect(tenantUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { plan: Plan.FREE } }),
      );
    });

    it('deja renovar el mismo plan', async () => {
      const { servicio, tenantUpdate } = montar({
        cobra: false,
        planActual: Plan.PRO,
      });

      await servicio.subscribe(actor, { plan: Plan.PRO });

      expect(tenantUpdate).toHaveBeenCalled();
    });
  });

  it('con un proveedor que sí cobra, subir de plan es normal', async () => {
    const { servicio, tenantUpdate } = montar({
      cobra: true,
      planActual: Plan.FREE,
    });

    await servicio.subscribe(actor, { plan: Plan.ENTERPRISE });

    expect(tenantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { plan: Plan.ENTERPRISE } }),
    );
  });

  // El día que se enchufe una pasarela, un pago rechazado no debe conceder el
  // plan. Hoy no puede pasar —el proveedor manual siempre responde ACTIVE—,
  // pero es justo el punto donde se colaría.
  it('no aplica el plan si la suscripción no queda viva', async () => {
    const { servicio, inicioSuscripcion, tenantUpdate } = montar({
      cobra: true,
      planActual: Plan.FREE,
    });
    inicioSuscripcion.mockResolvedValue({
      providerRef: 'ref',
      status: SubscriptionStatus.PAST_DUE,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
    });

    await servicio.subscribe(actor, { plan: Plan.ENTERPRISE });

    expect(tenantUpdate).not.toHaveBeenCalled();
  });
});
