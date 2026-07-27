import { ConfigService } from '@nestjs/config';
import {
  LegMode,
  NotificationChannel,
  Plan,
  PrismaClient,
  Role,
  ShipmentStatus,
  ShipmentType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma/prisma.service';

// Todo lo que crean estos tests lleva este prefijo en el slug del tenant, para
// que los restos de una corrida interrumpida sean identificables y se puedan
// purgar sin tocar datos reales de desarrollo.
export const TEST_SLUG_PREFIX = 'test-iso-';

export const TEST_PASSWORD = 'Sup3rSecret!';

// Cliente con el rol de aplicación (`ruteo_app`, NOSUPERUSER/NOBYPASSRLS): es el
// que usa el backend en producción y por tanto el único con el que tiene sentido
// verificar que RLS realmente filtra.
export function createAppPrisma(): PrismaService {
  const url = requireEnv('DATABASE_URL_APP');
  const config = { getOrThrow: () => url } as unknown as ConfigService;
  return new PrismaService(config);
}

// Cliente con el rol owner/superusuario (el de las migraciones). Ignora RLS, así
// que sirve para dos cosas y solo dos: purgar los tenants de prueba y comprobar
// desde fuera lo que el rol de aplicación no debería poder ver.
export function createAdminPrisma(): PrismaClient {
  return new PrismaClient({ datasourceUrl: requireEnv('DATABASE_URL') });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta ${name}. Los tests e2e necesitan la infra local: ` +
        '`docker compose up -d` en la raíz y `backend/.env` copiado de `.env.example`.',
    );
  }
  return value;
}

export function testSlug(suffix: string): string {
  return `${TEST_SLUG_PREFIX}${suffix}-${randomUUID().slice(0, 8)}`;
}

// Borra los tenants de prueba de una suite (incluidos los que dejó una corrida
// abortada). El borrado en cascada del esquema arrastra todas las filas hijas.
//
// `grupo` acota la purga a los tenants de la suite que llama: las suites e2e
// pueden correr en paralelo, y sin este acotamiento el `beforeAll` de una
// borraría los datos que otra está usando.
export async function purgeTestTenants(
  admin: PrismaClient,
  grupo: string,
): Promise<void> {
  await admin.tenant.deleteMany({
    where: { slug: { startsWith: `${TEST_SLUG_PREFIX}${grupo}-` } },
  });
}

export interface SeededTenant {
  tenantId: string;
  slug: string;
  email: string;
  userId: string;
  customerId: string;
  shipmentId: string;
  trackingNumber: string;
  legId: string;
  eventId: string;
  driverId: string;
  zoneId: string;
  routeId: string;
  routeStopId: string;
  lockerId: string;
  lockerPackageId: string;
  paymentId: string;
  apiKeyId: string;
  webhookEndpointId: string;
  subscriptionId: string;
  notificationId: string;
  auditLogId: string;
}

// Siembra un tenant con una fila en cada tabla tenant-scoped relevante, de modo
// que los tests puedan intentar alcanzarlas desde el contexto de otro tenant.
export async function seedTenant(
  prisma: PrismaService,
  label: string,
): Promise<SeededTenant> {
  const tenantId = randomUUID();
  const slug = testSlug(label);
  const email = `owner@${label}.test`;
  const trackingNumber = `TEST${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

  return prisma.withTenant(tenantId, async (tx) => {
    await tx.tenant.create({
      data: { id: tenantId, name: `Tenant ${label}`, slug, plan: Plan.FREE },
    });

    const user = await tx.user.create({
      data: {
        tenantId,
        email,
        // Hash fijo e inválido: este sembrado no se usa para login (de eso se
        // encarga el e2e de API, que registra vía HTTP).
        passwordHash: '$2b$12$invalidhashplaceholderinvalidhashplaceholder00',
        role: Role.OWNER,
      },
    });

    const customer = await tx.customer.create({
      data: { tenantId, name: `Cliente de ${label}` },
    });

    const shipment = await tx.shipment.create({
      data: {
        tenantId,
        customerId: customer.id,
        trackingNumber,
        type: ShipmentType.INTERNATIONAL,
        recipientName: `Destinatario de ${label}`,
        recipientPhone: '+50499990000',
        originLabel: 'Miami, FL',
        originCountry: 'US',
        destinationLabel: 'Tegucigalpa, HN',
        destinationCountry: 'HN',
        declaredValue: 250,
        codAmount: 500,
      },
    });

    const leg = await tx.shipmentLeg.create({
      data: {
        tenantId,
        shipmentId: shipment.id,
        sequence: 1,
        mode: LegMode.AIR,
        originLabel: 'Miami, FL',
        destinationLabel: 'Tegucigalpa, HN',
        externalTracking: `EXT-${label}`,
      },
    });

    const event = await tx.shipmentEvent.create({
      data: {
        tenantId,
        shipmentId: shipment.id,
        status: ShipmentStatus.CREATED,
        description: `Evento de ${label}`,
      },
    });

    const zone = await tx.zone.create({
      data: { tenantId, name: `Zona ${label}`, code: `Z-${label}` },
    });

    const driver = await tx.driver.create({
      data: { tenantId, zoneId: zone.id, name: `Repartidor ${label}` },
    });

    const route = await tx.route.create({
      data: {
        tenantId,
        driverId: driver.id,
        code: `R-${label}-${randomUUID().slice(0, 4)}`,
        scheduledDate: new Date('2026-07-26T00:00:00.000Z'),
      },
    });

    const routeStop = await tx.routeStop.create({
      data: {
        tenantId,
        routeId: route.id,
        shipmentId: shipment.id,
        sequence: 1,
      },
    });

    const locker = await tx.locker.create({
      data: {
        tenantId,
        customerId: customer.id,
        code: `L-${label}-${randomUUID().slice(0, 4)}`,
        customerName: `Cliente de ${label}`,
        addressLine1: '1234 NW 1st St',
        city: 'Miami',
        state: 'FL',
        postalCode: '33101',
      },
    });

    const lockerPackage = await tx.lockerPackage.create({
      data: {
        tenantId,
        lockerId: locker.id,
        description: `Paquete de ${label}`,
        declaredValue: 99,
      },
    });

    const payment = await tx.payment.create({
      data: { tenantId, shipmentId: shipment.id, amount: 500 },
    });

    const apiKey = await tx.apiKey.create({
      data: {
        tenantId,
        name: `Key ${label}`,
        prefix: randomUUID().slice(0, 12),
        keyHash: `hash-${label}`,
      },
    });

    const webhookEndpoint = await tx.webhookEndpoint.create({
      data: {
        tenantId,
        url: `https://${label}.test/hook`,
        secret: `whsec_${label}`,
        events: ['shipment.status_changed'],
      },
    });

    const now = new Date();
    const subscription = await tx.subscription.create({
      data: {
        tenantId,
        plan: Plan.STARTER,
        amount: 500,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
      },
    });

    const notification = await tx.notification.create({
      data: {
        tenantId,
        shipmentId: shipment.id,
        channel: NotificationChannel.SMS,
        recipient: '+50499990000',
        type: 'shipment.status_changed',
        body: `Mensaje de ${label}`,
      },
    });

    const auditLog = await tx.auditLog.create({
      data: {
        tenantId,
        action: 'shipment.status_changed',
        entityType: 'Shipment',
        entityId: shipment.id,
        actorUserId: user.id,
      },
    });

    return {
      tenantId,
      slug,
      email,
      userId: user.id,
      customerId: customer.id,
      shipmentId: shipment.id,
      trackingNumber,
      legId: leg.id,
      eventId: event.id,
      driverId: driver.id,
      zoneId: zone.id,
      routeId: route.id,
      routeStopId: routeStop.id,
      lockerId: locker.id,
      lockerPackageId: lockerPackage.id,
      paymentId: payment.id,
      apiKeyId: apiKey.id,
      webhookEndpointId: webhookEndpoint.id,
      subscriptionId: subscription.id,
      notificationId: notification.id,
      auditLogId: auditLog.id,
    };
  });
}
