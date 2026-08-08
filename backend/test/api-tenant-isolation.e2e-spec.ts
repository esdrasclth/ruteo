import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  createAdminPrisma,
  purgeTestTenants,
  TEST_PASSWORD,
  testSlug,
  limpiarVentanasDeRateLimit,
} from './tenant-fixtures';

interface Inquilino {
  slug: string;
  email: string;
  accessToken: string;
  tenantId: string;
  shipmentId: string;
  trackingNumber: string;
  customerId: string;
}

// Verifica el aislamiento tal como lo ve un integrador: por HTTP, con tokens y
// API keys reales. Complementa a `rls-isolation.e2e-spec.ts` (que prueba la
// política de Postgres) cubriendo guards, resolución de tenant y controladores.
describe('Aislamiento multi-tenant a través de la API', () => {
  let app: INestApplication<App>;
  let http: App;
  let admin: PrismaClient;
  let tenantA: Inquilino;
  let tenantB: Inquilino;

  beforeAll(async () => {
    await limpiarVentanasDeRateLimit();
    admin = createAdminPrisma();
    await purgeTestTenants(admin, 'api');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mismo cableado que `main.ts`: sin esto los tests probarían una app que no
    // se parece a la que corre en producción.
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    http = app.getHttpServer();

    tenantA = await registrarInquilino('api-a');
    tenantB = await registrarInquilino('api-b');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await purgeTestTenants(admin, 'api');
    await admin.$disconnect();
  }, 30_000);

  async function registrarInquilino(label: string): Promise<Inquilino> {
    const slug = testSlug(label);
    const email = `owner@${label}.test`;

    const registro = await request(http)
      .post('/api/auth/register')
      .send({
        tenantName: `Tenant ${label}`,
        slug,
        email,
        password: TEST_PASSWORD,
      })
      .expect(201);

    const accessToken = (registro.body as { accessToken: string }).accessToken;
    const auth = { Authorization: `Bearer ${accessToken}` };

    // Emitir credenciales (llaves de API, invitaciones) exige el correo
    // verificado. Se marca aquí en vez de recorrer el flujo del código porque
    // lo que esta suite prueba es el AISLAMIENTO, no la verificación —esa tiene
    // sus propias pruebas—. Sin este paso, la suite fallaría por una precondición
    // del negocio y no por una fuga entre tenants, que es lo que vigila.
    await admin.user.updateMany({
      where: { email },
      data: { emailVerified: true },
    });

    // Las llaves de API son del módulo Integraciones, que el plan FREE no trae.
    // Se sube a PRO porque lo que esta suite verifica es el AISLAMIENTO entre
    // empresas, no qué incluye cada plan —eso tiene sus propias pruebas—.
    await admin.tenant.updateMany({
      where: { slug },
      data: { plan: 'PRO' },
    });

    const yo = await request(http).get('/api/auth/me').set(auth).expect(200);

    const cliente = await request(http)
      .post('/api/customers')
      .set(auth)
      .send({ name: `Cliente de ${label}` })
      .expect(201);

    const envio = await request(http)
      .post('/api/shipments')
      .set(auth)
      .send({
        type: 'INTERNATIONAL',
        recipientName: `Destinatario de ${label}`,
        recipientPhone: '+50499990000',
        originLabel: 'Miami, FL',
        originCountry: 'US',
        destinationLabel: 'Tegucigalpa, HN',
        destinationCountry: 'HN',
        declaredValue: 250,
        codAmount: 500,
      })
      .expect(201);

    const cuerpoEnvio = envio.body as {
      id: string;
      trackingNumber: string;
    };

    return {
      slug,
      email,
      accessToken,
      tenantId: (yo.body as { tenantId: string }).tenantId,
      shipmentId: cuerpoEnvio.id,
      trackingNumber: cuerpoEnvio.trackingNumber,
      customerId: (cliente.body as { id: string }).id,
    };
  }

  function comoA() {
    return { Authorization: `Bearer ${tenantA.accessToken}` };
  }

  it('los dos tenants quedaron registrados y son distintos', () => {
    expect(tenantA.tenantId).not.toBe(tenantB.tenantId);
    expect(tenantA.shipmentId).not.toBe(tenantB.shipmentId);
  });

  describe('con token de acceso', () => {
    it('el listado de envíos solo trae los del propio tenant', async () => {
      const res = await request(http)
        .get('/api/shipments')
        .set(comoA())
        .expect(200);

      const { items, total } = res.body as {
        items: { id: string }[];
        total: number;
      };
      expect(items.map((s) => s.id)).toEqual([tenantA.shipmentId]);
      // El total paginado también debe contar solo lo propio.
      expect(total).toBe(1);
    });

    // Cada endpoint que recibe un id ajeno debe comportarse como si el recurso
    // no existiera: nunca 200, y tampoco 403 (que confirmaría su existencia).
    const porId: {
      ruta: string;
      metodo: 'get' | 'patch' | 'post';
      cuerpo?: object;
    }[] = [
      { ruta: '/api/shipments/:id', metodo: 'get' },
      { ruta: '/api/shipments/:id/label', metodo: 'get' },
      {
        ruta: '/api/shipments/:id/status',
        metodo: 'patch',
        cuerpo: { status: 'RECEIVED_USA' },
      },
      {
        ruta: '/api/shipments/:id/legs',
        metodo: 'post',
        cuerpo: {
          sequence: 1,
          mode: 'AIR',
          originLabel: 'Miami, FL',
          destinationLabel: 'Tegucigalpa, HN',
        },
      },
    ];

    it.each(porId)(
      'A recibe 404 en $metodo $ruta con el envío de B',
      async ({ ruta, metodo, cuerpo }) => {
        const url = ruta.replace(':id', tenantB.shipmentId);
        const req = request(http)[metodo](url).set(comoA());
        const res = await (cuerpo ? req.send(cuerpo) : req);

        expect(res.status).toBe(404);
      },
    );

    it('A recibe 404 al pedir el cliente de B', async () => {
      await request(http)
        .get(`/api/customers/${tenantB.customerId}`)
        .set(comoA())
        .expect(404);
    });

    it('el envío de B sigue intacto tras los intentos de A', async () => {
      const res = await request(http)
        .get(`/api/shipments/${tenantB.shipmentId}`)
        .set({ Authorization: `Bearer ${tenantB.accessToken}` })
        .expect(200);

      const envio = res.body as {
        status: string;
        recipientName: string;
        legs: unknown[];
      };
      expect(envio.status).toBe('CREATED');
      expect(envio.recipientName).toBe('Destinatario de api-b');
      expect(envio.legs).toEqual([]);
    });

    it('sin token no se accede a nada', async () => {
      await request(http)
        .get(`/api/shipments/${tenantB.shipmentId}`)
        .expect(401);
    });

    it('un token firmado con otro secreto es rechazado', async () => {
      await request(http)
        .get('/api/shipments')
        .set({ Authorization: 'Bearer no-es-un-jwt-valido' })
        .expect(401);
    });
  });

  describe('con API key', () => {
    let claveDeA: string;

    beforeAll(async () => {
      const res = await request(http)
        .post('/api/api-keys')
        .set(comoA())
        .send({ name: 'Integración de prueba' })
        .expect(201);
      claveDeA = (res.body as { key: string }).key;
    });

    it('la API key de A solo ve los envíos de A', async () => {
      const res = await request(http)
        .get('/api/shipments')
        .set({ 'x-api-key': claveDeA })
        .expect(200);

      const { items } = res.body as { items: { id: string }[] };
      expect(items.map((s) => s.id)).toEqual([tenantA.shipmentId]);
    });

    it('la API key de A no alcanza el envío de B', async () => {
      await request(http)
        .get(`/api/shipments/${tenantB.shipmentId}`)
        .set({ 'x-api-key': claveDeA })
        .expect(404);
    });

    it('una API key inexistente es rechazada', async () => {
      await request(http)
        .get('/api/shipments')
        .set({ 'x-api-key': `rk_${randomUUID().slice(0, 12)}_falsa` })
        .expect(401);
    });
  });

  describe('login', () => {
    it('las credenciales de B no sirven en el tenant de A', async () => {
      // Mismo email y contraseña, distinto slug: el usuario existe, pero no en
      // ese tenant.
      await request(http)
        .post('/api/auth/login')
        .send({
          slug: tenantA.slug,
          email: tenantB.email,
          password: TEST_PASSWORD,
        })
        .expect(401);
    });

    it('un slug inexistente no distingue de una contraseña incorrecta', async () => {
      await request(http)
        .post('/api/auth/login')
        .send({
          slug: `no-existe-${randomUUID().slice(0, 8)}`,
          email: tenantA.email,
          password: TEST_PASSWORD,
        })
        .expect(401);
    });
  });

  describe('rastreo público', () => {
    it('resuelve el envío de cualquier tenant sin autenticación', async () => {
      const res = await request(http)
        .get(`/api/tracking/${tenantB.trackingNumber}`)
        .expect(200);

      expect((res.body as { trackingNumber: string }).trackingNumber).toBe(
        tenantB.trackingNumber,
      );
    });

    it('no expone datos internos ni sensibles del tenant', async () => {
      const res = await request(http)
        .get(`/api/tracking/${tenantB.trackingNumber}`)
        .expect(200);

      const cuerpo = res.body as Record<string, unknown>;
      const serializado = JSON.stringify(cuerpo);

      // Ni identificadores internos ni importes de dinero deben salir por el
      // endpoint público.
      for (const campo of [
        'id',
        'tenantId',
        'customerId',
        'codAmount',
        'declaredValue',
        'recipientName',
        'recipientPhone',
      ]) {
        expect(cuerpo).not.toHaveProperty(campo);
      }
      expect(serializado).not.toContain(tenantB.tenantId);
      expect(serializado).not.toContain(tenantB.shipmentId);
      expect(serializado).not.toContain('+50499990000');
    });

    it('un tracking inexistente devuelve 404', async () => {
      await request(http)
        .get(`/api/tracking/NOEXISTE${randomUUID().slice(0, 8)}`)
        .expect(404);
    });
  });
});
