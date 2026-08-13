import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
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

/**
 * El rastreo público NO lleva sesión: cualquiera con un número de guía lo abre.
 *
 * Desde la fase 0.2 la misma tabla guarda los hitos del cliente y el trabajo
 * interno de la empresa, así que un descuido aquí ya no es un detalle de
 * presentación —es publicar por dónde va el negocio a quien pregunte—. Esta
 * suite existe para que ese descuido falle a gritos.
 */
describe('Visibilidad de los eventos en el rastreo público', () => {
  let app: INestApplication<App>;
  let http: App;
  let admin: PrismaClient;
  let auth: { Authorization: string };
  let shipmentId: string;
  let trackingNumber: string;

  const NOTA_INTERNA = 'Cliente moroso, cobrar antes de entregar';
  const NOTA_PUBLICA = 'Tu paquete sale en el vuelo del martes';

  beforeAll(async () => {
    await limpiarVentanasDeRateLimit();
    admin = createAdminPrisma();
    await purgeTestTenants(admin, 'eventos');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
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

    const slug = testSlug('eventos');
    const registro = await request(http)
      .post('/api/auth/register')
      .send({
        tenantName: 'Tenant eventos',
        slug,
        email: `owner@${slug}.test`,
        password: TEST_PASSWORD,
        phone: '+504 9999-8888',
        plan: 'PRO',
      })
      .expect(201);
    auth = {
      Authorization: `Bearer ${(registro.body as { accessToken: string }).accessToken}`,
    };

    const envio = await request(http)
      .post('/api/shipments')
      .set(auth)
      .send({
        type: 'INTERNATIONAL',
        recipientName: 'Destinatario',
        destinationLabel: 'Tegucigalpa',
        destinationCountry: 'HN',
        declaredValue: 250,
        currency: 'USD',
        weightKg: 2,
      })
      .expect(201);
    shipmentId = (envio.body as { id: string }).id;
    trackingNumber = (envio.body as { trackingNumber: string }).trackingNumber;

    // Un hecho de cada bando.
    await request(http)
      .post('/api/customs')
      .set(auth)
      .send({ shipmentId, handlingFee: 10 })
      .expect(201);
    await request(http)
      .post('/api/charges')
      .set(auth)
      .send({ shipmentId, concept: 'FREIGHT', amount: 45 })
      .expect(201);
    await request(http)
      .post(`/api/shipments/${shipmentId}/notes`)
      .set(auth)
      .send({ description: NOTA_INTERNA })
      .expect(201);
    await request(http)
      .post(`/api/shipments/${shipmentId}/notes`)
      .set(auth)
      .send({ description: NOTA_PUBLICA, publica: true })
      .expect(201);
  }, 60_000);

  afterAll(async () => {
    await purgeTestTenants(admin, 'eventos');
    await admin.$disconnect();
    await app.close();
  }, 30_000);

  async function publico() {
    const res = await request(http)
      .get(`/api/tracking/${trackingNumber}`)
      .expect(200);
    return res.body as {
      timeline: { eventType: string; status: string | null }[];
    };
  }

  it('el operador ve tanto lo interno como lo público', async () => {
    const res = await request(http)
      .get(`/api/shipments/${shipmentId}`)
      .set(auth)
      .expect(200);
    const eventos = (res.body as { events: { eventType: string }[] }).events;
    const tipos = eventos.map((e) => e.eventType);
    expect(tipos).toContain('CHARGE_ADDED');
    expect(tipos).toContain('CUSTOMS_ASSESSED');
    expect(tipos.filter((t) => t === 'NOTE')).toHaveLength(2);
  });

  it('el cliente no ve los eventos internos', async () => {
    const { timeline } = await publico();
    const tipos = timeline.map((e) => e.eventType);
    expect(tipos).toContain('STATUS_CHANGED');
    expect(tipos).toContain('CUSTOMS_ASSESSED');
    expect(tipos).not.toContain('CHARGE_ADDED');
  });

  // La prueba que de verdad importa: no basta con que no aparezca el tipo, el
  // TEXTO no puede estar en la respuesta ni escondido en un campo que nadie
  // pinta.
  it('el texto de una nota interna no viaja en la respuesta pública', async () => {
    const res = await request(http)
      .get(`/api/tracking/${trackingNumber}`)
      .expect(200);
    const crudo = JSON.stringify(res.body);
    expect(crudo).not.toContain(NOTA_INTERNA);
    expect(crudo).toContain(NOTA_PUBLICA);
  });

  // Una nota marcada como pública se publica aunque su tipo sea interno por
  // defecto: la visibilidad de la fila manda sobre la del tipo.
  it('una nota marcada como pública sí llega al cliente', async () => {
    const { timeline } = await publico();
    expect(timeline.some((e) => e.eventType === 'NOTE')).toBe(true);
  });

  // El cambio de raíz de la fase 0.2: hay hitos públicos que no son cambios de
  // estado. Si `status` volviera a ser obligatorio, esto se cae.
  it('hay eventos públicos sin estado', async () => {
    const { timeline } = await publico();
    const sinEstado = timeline.filter((e) => e.status === null);
    expect(sinEstado.length).toBeGreaterThan(0);
    expect(sinEstado.map((e) => e.eventType)).toContain('CUSTOMS_ASSESSED');
  });

  // Los ids internos no le sirven a nadie de fuera y son material para
  // enumerar la base.
  it('la metadata interna no se expone', async () => {
    const res = await request(http)
      .get(`/api/tracking/${trackingNumber}`)
      .expect(200);
    const crudo = JSON.stringify(res.body);
    expect(crudo).not.toContain('chargeId');
    expect(crudo).not.toContain('ruleId');
    expect(crudo).not.toContain('metadata');
  });
});
