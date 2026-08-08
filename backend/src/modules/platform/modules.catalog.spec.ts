import { Plan, TenantModule } from '@prisma/client';
import {
  ESENCIALES,
  MODULOS_POR_PLAN,
  modulosEfectivos,
} from './modules.catalog';

// Esta función decide qué puede usar cada empresa. Si se rompe, o se le corta
// el acceso a alguien que paga, o se le regala lo que no contrató.

describe('modulosEfectivos', () => {
  it('sin excepciones devuelve exactamente lo del plan', () => {
    const r = modulosEfectivos(Plan.STARTER, []);
    expect(new Set(r)).toEqual(new Set(MODULOS_POR_PLAN[Plan.STARTER]));
  });

  it('una excepción puede ACTIVAR algo que el plan no trae', () => {
    // Es el caso de un acuerdo comercial: darle una función suelta a un cliente
    // sin inventar un plan nuevo.
    expect(MODULOS_POR_PLAN[Plan.FREE]).not.toContain(TenantModule.ROUTES);

    const r = modulosEfectivos(Plan.FREE, [
      { module: TenantModule.ROUTES, enabled: true },
    ]);
    expect(r).toContain(TenantModule.ROUTES);
  });

  it('una excepción puede DESACTIVAR algo que el plan sí trae', () => {
    const r = modulosEfectivos(Plan.PRO, [
      { module: TenantModule.LOCKERS, enabled: false },
    ]);
    expect(r).not.toContain(TenantModule.LOCKERS);
  });

  it('los esenciales NO se pueden apagar ni con una excepción', () => {
    // Defensa contra una fila antigua o un error de datos: apagar envíos
    // dejaría a la empresa mirando un panel vacío sin saber por qué.
    const r = modulosEfectivos(
      Plan.PRO,
      [...ESENCIALES].map((m) => ({ module: m, enabled: false })),
    );
    for (const esencial of ESENCIALES) expect(r).toContain(esencial);
  });

  it('subir de plan hereda lo nuevo sin tocar las excepciones', () => {
    // Solo se guarda la desviación, así que al cambiar de plan el tenant recibe
    // todo lo que el plan nuevo trae, salvo lo que se le desactivó a propósito.
    const excepciones = [{ module: TenantModule.LOCKERS, enabled: false }];

    const free = modulosEfectivos(Plan.FREE, excepciones);
    const pro = modulosEfectivos(Plan.PRO, excepciones);

    expect(free).not.toContain(TenantModule.ROUTES);
    expect(pro).toContain(TenantModule.ROUTES);
    // Y la desactivación deliberada sobrevive al cambio.
    expect(pro).not.toContain(TenantModule.LOCKERS);
  });

  it('ENTERPRISE trae todo el catálogo', () => {
    const r = modulosEfectivos(Plan.ENTERPRISE, []);
    expect(r.length).toBe(Object.keys(TenantModule).length);
  });
});
