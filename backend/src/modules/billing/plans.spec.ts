import { Plan, SubscriptionStatus } from '@prisma/client';
import { planEfectivo, pruebaVigente } from './plans';

// El plan efectivo es lo que decide qué módulos ve una empresa y cuántos envíos
// puede crear. Una prueba vencida que siguiera contando como plan de pago sería
// ENTERPRISE gratis y para siempre, y es un fallo que nadie reporta: al cliente
// no le molesta que le sobre plan.

const AHORA = new Date('2026-08-12T00:00:00Z');
const AYER = new Date('2026-08-11T00:00:00Z');
const MANANA = new Date('2026-08-13T00:00:00Z');

describe('pruebaVigente', () => {
  it('vigente mientras no llegue el fin de periodo', () => {
    expect(pruebaVigente(SubscriptionStatus.TRIALING, MANANA, AHORA)).toBe(
      true,
    );
  });

  it('vencida en cuanto pasa', () => {
    expect(pruebaVigente(SubscriptionStatus.TRIALING, AYER, AHORA)).toBe(false);
  });

  it('lo que no es TRIALING no es una prueba', () => {
    expect(pruebaVigente(SubscriptionStatus.ACTIVE, AYER, AHORA)).toBe(false);
  });
});

describe('planEfectivo', () => {
  it('mantiene el plan mientras la prueba esté viva', () => {
    expect(
      planEfectivo(
        Plan.PRO,
        { status: SubscriptionStatus.TRIALING, currentPeriodEnd: MANANA },
        AHORA,
      ),
    ).toBe(Plan.PRO);
  });

  // El caso que importa: la columna `Tenant.plan` todavía dice PRO porque el
  // trabajo de caducidad no ha corrido —o el worker está parado—, y aun así no
  // se le dan los módulos de PRO.
  it('una prueba vencida vale FREE aunque el tenant siga marcado como PRO', () => {
    expect(
      planEfectivo(
        Plan.PRO,
        { status: SubscriptionStatus.TRIALING, currentPeriodEnd: AYER },
        AHORA,
      ),
    ).toBe(Plan.FREE);
  });

  it('una suscripción ACTIVA vencida no se toca: eso es cosa del cobro', () => {
    // Un periodo cerrado en una suscripción de pago significa "toca renovar",
    // no "se acabó". Degradarla aquí cortaría el servicio a quien sí paga por
    // el retraso de un cobro.
    expect(
      planEfectivo(
        Plan.PRO,
        { status: SubscriptionStatus.ACTIVE, currentPeriodEnd: AYER },
        AHORA,
      ),
    ).toBe(Plan.PRO);
  });

  it('sin suscripción manda la columna del tenant', () => {
    expect(planEfectivo(Plan.FREE, null, AHORA)).toBe(Plan.FREE);
  });
});
