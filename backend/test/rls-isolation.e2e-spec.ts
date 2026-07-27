import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createAdminPrisma,
  createAppPrisma,
  purgeTestTenants,
  SeededTenant,
  seedTenant,
} from './tenant-fixtures';

// Verifica la línea de defensa principal del multi-tenancy: las políticas RLS de
// Postgres. Todo corre con el rol de aplicación (`ruteo_app`), que es el que usa
// el backend; si estas pruebas pasan con el rol equivocado (owner/superusuario)
// no prueban nada, así que lo primero que se comprueba es justamente eso.
describe('Aislamiento multi-tenant en la base de datos (RLS)', () => {
  let prisma: PrismaService;
  let admin: PrismaClient;
  let tenantA: SeededTenant;
  let tenantB: SeededTenant;

  beforeAll(async () => {
    admin = createAdminPrisma();
    prisma = createAppPrisma();
    await purgeTestTenants(admin, 'rls');
    tenantA = await seedTenant(prisma, 'rls-a');
    tenantB = await seedTenant(prisma, 'rls-b');
  }, 60_000);

  afterAll(async () => {
    await purgeTestTenants(admin, 'rls');
    await admin.$disconnect();
    await prisma.$disconnect();
  }, 30_000);

  describe('premisa: el rol de aplicación está sujeto a RLS', () => {
    it('no es superusuario ni tiene BYPASSRLS', async () => {
      const [role] = await prisma.$queryRaw<
        { rolsuper: boolean; rolbypassrls: boolean; rolname: string }[]
      >`SELECT rolname, rolsuper, rolbypassrls
          FROM pg_roles WHERE rolname = current_user`;

      expect(role.rolsuper).toBe(false);
      expect(role.rolbypassrls).toBe(false);
    });
  });

  describe('lectura entre tenants', () => {
    // Cada entrada replica el patrón real de los servicios: buscar por id dentro
    // de `withTenant`, sin filtrar por tenant_id en la aplicación. Si RLS falla,
    // estas consultas devuelven la fila del otro tenant.
    const lookups: {
      entidad: string;
      idDe: (t: SeededTenant) => string;
      find: (tx: Prisma.TransactionClient, id: string) => Promise<unknown>;
    }[] = [
      {
        entidad: 'shipments',
        idDe: (t) => t.shipmentId,
        find: (tx, id) => tx.shipment.findUnique({ where: { id } }),
      },
      {
        entidad: 'shipment_legs',
        idDe: (t) => t.legId,
        find: (tx, id) => tx.shipmentLeg.findUnique({ where: { id } }),
      },
      {
        entidad: 'shipment_events',
        idDe: (t) => t.eventId,
        find: (tx, id) => tx.shipmentEvent.findUnique({ where: { id } }),
      },
      {
        entidad: 'customers',
        idDe: (t) => t.customerId,
        find: (tx, id) => tx.customer.findUnique({ where: { id } }),
      },
      {
        entidad: 'users',
        idDe: (t) => t.userId,
        find: (tx, id) => tx.user.findUnique({ where: { id } }),
      },
      {
        entidad: 'drivers',
        idDe: (t) => t.driverId,
        find: (tx, id) => tx.driver.findUnique({ where: { id } }),
      },
      {
        entidad: 'zones',
        idDe: (t) => t.zoneId,
        find: (tx, id) => tx.zone.findUnique({ where: { id } }),
      },
      {
        entidad: 'routes',
        idDe: (t) => t.routeId,
        find: (tx, id) => tx.route.findUnique({ where: { id } }),
      },
      {
        entidad: 'route_stops',
        idDe: (t) => t.routeStopId,
        find: (tx, id) => tx.routeStop.findUnique({ where: { id } }),
      },
      {
        entidad: 'lockers',
        idDe: (t) => t.lockerId,
        find: (tx, id) => tx.locker.findUnique({ where: { id } }),
      },
      {
        entidad: 'locker_packages',
        idDe: (t) => t.lockerPackageId,
        find: (tx, id) => tx.lockerPackage.findUnique({ where: { id } }),
      },
      {
        entidad: 'payments',
        idDe: (t) => t.paymentId,
        find: (tx, id) => tx.payment.findUnique({ where: { id } }),
      },
      {
        entidad: 'api_keys',
        idDe: (t) => t.apiKeyId,
        find: (tx, id) => tx.apiKey.findUnique({ where: { id } }),
      },
      {
        entidad: 'webhook_endpoints',
        idDe: (t) => t.webhookEndpointId,
        find: (tx, id) => tx.webhookEndpoint.findUnique({ where: { id } }),
      },
      {
        entidad: 'subscriptions',
        idDe: (t) => t.subscriptionId,
        find: (tx, id) => tx.subscription.findUnique({ where: { id } }),
      },
      {
        entidad: 'notifications',
        idDe: (t) => t.notificationId,
        find: (tx, id) => tx.notification.findUnique({ where: { id } }),
      },
      {
        entidad: 'audit_logs',
        idDe: (t) => t.auditLogId,
        find: (tx, id) => tx.auditLog.findUnique({ where: { id } }),
      },
    ];

    it.each(lookups)(
      'el tenant A no puede leer $entidad del tenant B por id',
      async ({ idDe, find }) => {
        const idDeB = idDe(tenantB);

        const desdeA = await prisma.withTenant(tenantA.tenantId, (tx) =>
          find(tx, idDeB),
        );
        expect(desdeA).toBeNull();

        // Control: la fila sí existe y es visible desde su propio tenant, para
        // que el test no pase por un id inexistente.
        const desdeB = await prisma.withTenant(tenantB.tenantId, (tx) =>
          find(tx, idDeB),
        );
        expect(desdeB).not.toBeNull();
      },
    );

    it('los listados solo devuelven filas del tenant activo', async () => {
      const [enviosA, enviosB] = await Promise.all([
        prisma.withTenant(tenantA.tenantId, (tx) => tx.shipment.findMany()),
        prisma.withTenant(tenantB.tenantId, (tx) => tx.shipment.findMany()),
      ]);

      expect(enviosA.map((s) => s.id)).toEqual([tenantA.shipmentId]);
      expect(enviosB.map((s) => s.id)).toEqual([tenantB.shipmentId]);
    });

    it('los conteos y agregados no cruzan tenants', async () => {
      const total = await prisma.withTenant(tenantA.tenantId, (tx) =>
        tx.shipment.count(),
      );
      expect(total).toBe(1);

      const suma = await prisma.withTenant(tenantA.tenantId, (tx) =>
        tx.payment.aggregate({ _sum: { amount: true } }),
      );
      // Solo el pago de A (500), no el de B.
      expect(Number(suma._sum.amount)).toBe(500);
    });

    it('una búsqueda por campo único global no expone el envío de otro tenant', async () => {
      // `tracking_number` es único en toda la tabla, no por tenant: sin RLS,
      // buscar por el tracking de B desde A devolvería la fila.
      const encontrado = await prisma.withTenant(tenantA.tenantId, (tx) =>
        tx.shipment.findUnique({
          where: { trackingNumber: tenantB.trackingNumber },
        }),
      );
      expect(encontrado).toBeNull();
    });

    it('las relaciones anidadas tampoco filtran datos del otro tenant', async () => {
      const cliente = await prisma.withTenant(tenantA.tenantId, (tx) =>
        tx.customer.findFirst({ include: { shipments: true, lockers: true } }),
      );

      expect(cliente?.id).toBe(tenantA.customerId);
      expect(cliente?.shipments.map((s) => s.id)).toEqual([tenantA.shipmentId]);
      expect(cliente?.lockers.map((l) => l.id)).toEqual([tenantA.lockerId]);
    });

    it('sin contexto de tenant no se ve ninguna fila (fail-closed)', async () => {
      // Fuera de `withTenant` no hay `app.current_tenant_id`, así que
      // `current_tenant_id()` es NULL y ninguna política se cumple.
      const [envios, clientes, usuarios] = await Promise.all([
        prisma.shipment.findMany(),
        prisma.customer.findMany(),
        prisma.user.findMany(),
      ]);

      expect(envios).toEqual([]);
      expect(clientes).toEqual([]);
      expect(usuarios).toEqual([]);
    });

    it('el contexto de tenant no sobrevive a la transacción', async () => {
      await prisma.withTenant(tenantA.tenantId, (tx) => tx.shipment.findMany());

      // `set_config(..., true)` es local a la transacción: al terminar, la
      // conexión vuelve al pool sin contexto y no arrastra el tenant anterior.
      const despues = await prisma.shipment.findMany();
      expect(despues).toEqual([]);
    });
  });

  describe('escritura entre tenants', () => {
    it('el tenant A no puede modificar un envío del tenant B', async () => {
      await expect(
        prisma.withTenant(tenantA.tenantId, (tx) =>
          tx.shipment.update({
            where: { id: tenantB.shipmentId },
            data: { recipientName: 'SECUESTRADO' },
          }),
        ),
      ).rejects.toThrow();

      const intacto = await prisma.withTenant(tenantB.tenantId, (tx) =>
        tx.shipment.findUnique({ where: { id: tenantB.shipmentId } }),
      );
      expect(intacto?.recipientName).toBe('Destinatario de rls-b');
    });

    it('un updateMany desde A no toca ninguna fila de B', async () => {
      const resultado = await prisma.withTenant(tenantA.tenantId, (tx) =>
        tx.shipment.updateMany({ data: { recipientName: 'MASIVO' } }),
      );
      // Solo alcanzó su propia fila.
      expect(resultado.count).toBe(1);

      const deB = await prisma.withTenant(tenantB.tenantId, (tx) =>
        tx.shipment.findUnique({ where: { id: tenantB.shipmentId } }),
      );
      expect(deB?.recipientName).toBe('Destinatario de rls-b');
    });

    it('el tenant A no puede borrar un envío del tenant B', async () => {
      await expect(
        prisma.withTenant(tenantA.tenantId, (tx) =>
          tx.shipment.delete({ where: { id: tenantB.shipmentId } }),
        ),
      ).rejects.toThrow();

      const sigueAhi = await prisma.withTenant(tenantB.tenantId, (tx) =>
        tx.shipment.findUnique({ where: { id: tenantB.shipmentId } }),
      );
      expect(sigueAhi).not.toBeNull();
    });

    it('un deleteMany desde A no borra filas de B', async () => {
      const resultado = await prisma.withTenant(tenantA.tenantId, (tx) =>
        tx.notification.deleteMany({}),
      );
      expect(resultado.count).toBe(1);

      const deB = await prisma.withTenant(tenantB.tenantId, (tx) =>
        tx.notification.findUnique({ where: { id: tenantB.notificationId } }),
      );
      expect(deB).not.toBeNull();
    });

    it('el tenant A no puede insertar una fila marcada con el tenant de B', async () => {
      // El WITH CHECK de las políticas impide "plantar" datos en otro tenant.
      await expect(
        prisma.withTenant(tenantA.tenantId, (tx) =>
          tx.customer.create({
            data: { tenantId: tenantB.tenantId, name: 'Infiltrado' },
          }),
        ),
      ).rejects.toThrow();

      const clientesDeB = await prisma.withTenant(tenantB.tenantId, (tx) =>
        tx.customer.findMany(),
      );
      expect(clientesDeB.map((c) => c.name)).toEqual(['Cliente de rls-b']);
    });

    it('el tenant A no puede reasignar su propio envío al tenant B', async () => {
      await expect(
        prisma.withTenant(tenantA.tenantId, (tx) =>
          tx.shipment.update({
            where: { id: tenantA.shipmentId },
            data: { tenantId: tenantB.tenantId },
          }),
        ),
      ).rejects.toThrow();
    });

    it('el tenant A no puede leer ni modificar el registro de otro tenant en `tenants`', async () => {
      const visto = await prisma.withTenant(tenantA.tenantId, (tx) =>
        tx.tenant.findUnique({ where: { id: tenantB.tenantId } }),
      );
      expect(visto).toBeNull();

      await expect(
        prisma.withTenant(tenantA.tenantId, (tx) =>
          tx.tenant.update({
            where: { id: tenantB.tenantId },
            data: { name: 'Secuestrado' },
          }),
        ),
      ).rejects.toThrow();
    });
  });

  describe('cobertura estructural de las políticas', () => {
    it('toda tabla con `tenant_id` tiene RLS habilitado, forzado y con política', async () => {
      const tablas = await prisma.$queryRaw<
        {
          tabla: string;
          rls_habilitado: boolean;
          rls_forzado: boolean;
          politicas: number;
        }[]
      >`
        SELECT c.relname                                        AS tabla,
               c.relrowsecurity                                 AS rls_habilitado,
               c.relforcerowsecurity                            AS rls_forzado,
               (SELECT count(*)::int FROM pg_policies p
                 WHERE p.schemaname = 'public'
                   AND p.tablename = c.relname)                 AS politicas
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind = 'r'
           AND EXISTS (
                 SELECT 1 FROM information_schema.columns col
                  WHERE col.table_schema = 'public'
                    AND col.table_name = c.relname
                    AND col.column_name = 'tenant_id')
         ORDER BY c.relname`;

      // Si esto falla, una migración nueva agregó una tabla tenant-scoped y se
      // olvidó de la migración `*_rls` correspondiente.
      expect(tablas.length).toBeGreaterThan(0);
      const desprotegidas = tablas.filter(
        (t) => !t.rls_habilitado || !t.rls_forzado || t.politicas === 0,
      );
      expect(desprotegidas).toEqual([]);
    });

    it('la tabla `tenants` está protegida por su propia clave primaria', async () => {
      const [tenants] = await prisma.$queryRaw<
        { rls_habilitado: boolean; rls_forzado: boolean; politicas: number }[]
      >`
        SELECT c.relrowsecurity      AS rls_habilitado,
               c.relforcerowsecurity AS rls_forzado,
               (SELECT count(*)::int FROM pg_policies p
                 WHERE p.schemaname = 'public'
                   AND p.tablename = 'tenants')  AS politicas
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'tenants'`;

      expect(tenants.rls_habilitado).toBe(true);
      expect(tenants.rls_forzado).toBe(true);
      expect(tenants.politicas).toBeGreaterThanOrEqual(4);
    });
  });

  describe('funciones SECURITY DEFINER', () => {
    it('`tenant_id_by_slug` resuelve el tenant sin exponer otros datos', async () => {
      // El login la necesita antes de que exista contexto de tenant. Debe
      // devolver únicamente el id, nunca la fila completa.
      const filas = await prisma.$queryRaw<
        { tenant_id_by_slug: string | null }[]
      >`SELECT tenant_id_by_slug(${tenantB.slug})`;

      expect(filas[0].tenant_id_by_slug).toBe(tenantB.tenantId);

      // Y aun conociendo el id, sin el contexto correcto la fila sigue oculta.
      const fila = await prisma.withTenant(tenantA.tenantId, (tx) =>
        tx.tenant.findUnique({ where: { id: tenantB.tenantId } }),
      );
      expect(fila).toBeNull();
    });

    it('un slug inexistente no resuelve a ningún tenant', async () => {
      const filas = await prisma.$queryRaw<
        { tenant_id_by_slug: string | null }[]
      >`SELECT tenant_id_by_slug(${`no-existe-${randomUUID()}`})`;

      expect(filas[0].tenant_id_by_slug).toBeNull();
    });
  });
});
