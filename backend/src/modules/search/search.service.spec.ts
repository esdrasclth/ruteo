import { TenantModule } from '@prisma/client';
import { SearchService } from './search.service';

// El buscador global cruza cinco módulos y no puede llevar un `@Modulo` propio,
// así que lo que respeta el plan es cada sección por separado. Si esto se
// rompe, una empresa del plan FREE ve casilleros y rutas que no contrató, y
// cada resultado la lleva a una pantalla que le responde 403.

function servicio() {
  const queryRaw = jest.fn().mockResolvedValue([]);
  const prisma = {
    withTenant: <T>(_t: string, cb: (tx: unknown) => Promise<T>) =>
      cb({ $queryRaw: queryRaw }),
  };
  return {
    search: new SearchService(prisma as never),
    queryRaw,
  };
}

const TODOS = Object.values(TenantModule);

describe('SearchService.search', () => {
  it('sin lista de módulos busca en todo: es como se comportaba antes', async () => {
    const { search, queryRaw } = servicio();
    await search.search('t1', 'lopez', undefined);
    expect(queryRaw).toHaveBeenCalledTimes(5);
  });

  it('con todos los módulos activos busca en todo', async () => {
    const { search, queryRaw } = servicio();
    await search.search('t1', 'lopez', TODOS);
    expect(queryRaw).toHaveBeenCalledTimes(5);
  });

  it('no consulta casilleros si el plan no los trae', async () => {
    const { search, queryRaw } = servicio();
    const sinCasilleros = TODOS.filter((m) => m !== TenantModule.LOCKERS);

    const r = await search.search('t1', 'lopez', sinCasilleros);

    expect(queryRaw).toHaveBeenCalledTimes(4);
    expect(r.casilleros).toEqual([]);
  });

  // El plan FREE: envíos, clientes, facturación y notificaciones. De las cinco
  // secciones del buscador solo le corresponden dos.
  it('en el plan FREE solo busca envíos y clientes', async () => {
    const { search, queryRaw } = servicio();

    const r = await search.search('t1', 'lopez', [
      TenantModule.SHIPMENTS,
      TenantModule.CUSTOMERS,
      TenantModule.BILLING,
      TenantModule.NOTIFICATIONS,
    ]);

    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(r.casilleros).toEqual([]);
    expect(r.rutas).toEqual([]);
    expect(r.repartidores).toEqual([]);
  });

  // Los repartidores se enlazan a `/routes?driverId=…`, así que sin rutas el
  // resultado no lleva a ninguna parte aunque el módulo de repartidores esté.
  it('oculta repartidores si hay repartidores pero no rutas', async () => {
    const { search, queryRaw } = servicio();
    const sinRutas = TODOS.filter((m) => m !== TenantModule.ROUTES);

    const r = await search.search('t1', 'lopez', sinRutas);

    expect(r.repartidores).toEqual([]);
    expect(r.rutas).toEqual([]);
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });

  it('no consulta nada con menos de dos caracteres', async () => {
    const { search, queryRaw } = servicio();
    const r = await search.search('t1', 'a', TODOS);

    expect(queryRaw).not.toHaveBeenCalled();
    expect(r.total).toBe(0);
  });
});
