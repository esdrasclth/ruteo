import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  NotificationChannel,
  NotificationStatus,
  PrismaClient,
  WebhookStatus,
} from '@prisma/client';
import { createHmac, randomUUID } from 'crypto';
import { createServer, IncomingMessage, Server } from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { NOTIFICATION_PROVIDER } from '../src/modules/notifications/notification-provider';
import type {
  NotificationMessage,
  NotificationProvider,
  NotificationSendResult,
} from '../src/modules/notifications/notification-provider';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { WebhooksService } from '../src/modules/webhooks/webhooks.service';
import {
  createAdminPrisma,
  purgeTestTenants,
  TEST_PASSWORD,
  testSlug,
  limpiarVentanasDeRateLimit,
} from './tenant-fixtures';

// Destinatario del envio de prueba: los avisos de estado van aqui.
const TELEFONO = '+50499990000';

interface WebhookRecibido {
  event: string;
  signature: string;
  body: string;
}

// Proveedor de notificaciones controlable: permite forzar N fallos seguidos
// para observar los reintentos de BullMQ sin depender de un servicio externo.
class ProveedorControlable implements NotificationProvider {
  readonly name = 'test';
  envios: NotificationMessage[] = [];
  // Los fallos se programan POR DESTINATARIO. Con un contador global, una
  // entrega en vuelo de un test anterior (dispatch es fire-and-forget) consumia
  // el fallo que este test acababa de preparar, y la prueba fallaba sin motivo.
  private fallosPorDestinatario = new Map<string, number>();

  programarFallos(recipient: string, veces: number) {
    this.fallosPorDestinatario.set(recipient, veces);
  }

  fallosRestantes(recipient: string): number {
    return this.fallosPorDestinatario.get(recipient) ?? 0;
  }

  enviosA(recipient: string): NotificationMessage[] {
    return this.envios.filter((e) => e.recipient === recipient);
  }

  send(message: NotificationMessage): Promise<NotificationSendResult> {
    this.envios.push(message);
    const pendientes = this.fallosPorDestinatario.get(message.recipient) ?? 0;
    if (pendientes > 0) {
      this.fallosPorDestinatario.set(message.recipient, pendientes - 1);
      return Promise.resolve({ ok: false, error: 'fallo simulado' });
    }
    return Promise.resolve({ ok: true });
  }
}

async function esperarA<T>(
  intento: () => Promise<T | null>,
  descripcion: string,
  timeoutMs = 20_000,
): Promise<T> {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    const resultado = await intento();
    if (resultado !== null) {
      return resultado;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timeout esperando: ${descripcion}`);
}

describe('Entrega asíncrona por BullMQ', () => {
  let app: INestApplication<App>;
  let http: App;
  let admin: PrismaClient;
  let proveedor: ProveedorControlable;
  let webhooks: WebhooksService;
  let notifications: NotificationsService;

  // Receptor de webhooks: registra lo que llega y puede fallar a demanda.
  let receptor: Server;
  let urlReceptor: string;
  let recibidos: WebhookRecibido[] = [];
  let fallosPendientesHttp = 0;

  let tenantId: string;
  let accessToken: string;
  let secretoWebhook: string;
  let shipmentId: string;

  beforeAll(async () => {
    await limpiarVentanasDeRateLimit();
    admin = createAdminPrisma();
    await purgeTestTenants(admin, 'queue');

    receptor = await levantarReceptor();
    const { port } = receptor.address() as AddressInfo;
    urlReceptor = `http://127.0.0.1:${port}/hook`;

    proveedor = new ProveedorControlable();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PROVIDER)
      .useValue(proveedor)
      .compile();

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
    webhooks = moduleRef.get(WebhooksService);
    notifications = moduleRef.get(NotificationsService);

    ({ tenantId, accessToken, secretoWebhook, shipmentId } =
      await prepararTenant());
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await new Promise<void>((resolve) => receptor?.close(() => resolve()));
    await purgeTestTenants(admin, 'queue');
    await admin.$disconnect();
  }, 30_000);

  function levantarReceptor(): Promise<Server> {
    const server = createServer((req: IncomingMessage, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        recibidos.push({
          event: String(req.headers['x-ruteo-event'] ?? ''),
          signature: String(req.headers['x-ruteo-signature'] ?? ''),
          body,
        });
        if (fallosPendientesHttp > 0) {
          fallosPendientesHttp--;
          res.writeHead(500).end('nope');
          return;
        }
        res.writeHead(200).end('ok');
      });
    });
    return new Promise((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve(server)),
    );
  }

  async function prepararTenant() {
    const registro = await request(http)
      .post('/api/auth/register')
      .send({
        tenantName: 'Tenant colas',
        slug: testSlug('queue'),
        email: 'owner@queue.test',
        password: TEST_PASSWORD,
        // Ver la nota en `api-tenant-isolation`: el alta lo exige desde que
        // pide plan.
        phone: '+504 9999-8888',
      })
      .expect(201);
    const token = (registro.body as { accessToken: string }).accessToken;
    const auth = { Authorization: `Bearer ${token}` };

    const yo = await request(http).get('/api/auth/me').set(auth).expect(200);

    // Los webhooks son del módulo Integraciones, que el plan FREE no incluye:
    // sin esto el alta devuelve 403. Un cliente que usa webhooks paga un plan
    // que los trae, así que la prueba refleja el caso real.
    await admin.tenant.update({
      where: { id: yo.body.tenantId as string },
      data: { plan: 'PRO' },
    });

    const webhook = await request(http)
      .post('/api/webhooks')
      .set(auth)
      .send({ url: urlReceptor, events: ['shipment.status_changed'] })
      .expect(201);

    const envio = await request(http)
      .post('/api/shipments')
      .set(auth)
      .send({
        type: 'LOCAL',
        recipientName: 'Destinatario',
        recipientPhone: TELEFONO,
      })
      .expect(201);

    return {
      tenantId: (yo.body as { tenantId: string }).tenantId,
      accessToken: token,
      secretoWebhook: (webhook.body as { secret: string }).secret,
      shipmentId: (envio.body as { id: string }).id,
    };
  }

  function cambiarEstado(status: string) {
    return request(http)
      .patch(`/api/shipments/${shipmentId}/status`)
      .set({ Authorization: `Bearer ${accessToken}` })
      .send({ status })
      .expect(200);
  }

  function entregas(estado?: WebhookStatus) {
    return admin.webhookDelivery.findMany({
      where: { tenantId, ...(estado ? { status: estado } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  }

  describe('webhooks', () => {
    it('un cambio de estado se entrega por la cola, firmado', async () => {
      recibidos = [];
      await cambiarEstado('LABEL_GENERATED');

      const entrega = await esperarA(
        async () =>
          (await entregas(WebhookStatus.SUCCESS)).find(
            (d) => d.event === 'shipment.status_changed',
          ) ?? null,
        'la entrega del webhook llega a SUCCESS',
      );

      expect(entrega.attempts).toBe(1);
      expect(entrega.responseStatus).toBe(200);
      expect(entrega.lastError).toBeNull();

      // La firma HMAC debe validar contra el secreto entregado al crear el
      // endpoint, calculada sobre el cuerpo exacto que viajó.
      const recibido = recibidos.at(-1)!;
      const esperada = createHmac('sha256', secretoWebhook)
        .update(recibido.body)
        .digest('hex');
      expect(recibido.signature).toBe(`sha256=${esperada}`);
      expect(recibido.event).toBe('shipment.status_changed');

      const cuerpo = JSON.parse(recibido.body) as {
        event: string;
        data: { status: string };
      };
      expect(cuerpo.event).toBe('shipment.status_changed');
      expect(cuerpo.data.status).toBe('LABEL_GENERATED');
    }, 40_000);

    it('un fallo transitorio se reintenta hasta entregarse', async () => {
      recibidos = [];
      fallosPendientesHttp = 1; // el primer POST responde 500

      await cambiarEstado('PICKED_UP');

      const entrega = await esperarA(async () => {
        const todas = await entregas(WebhookStatus.SUCCESS);
        return todas.find((d) => d.attempts > 1) ?? null;
      }, 'el webhook se reintenta y termina en SUCCESS');

      // Prueba de que el reintento lo hace la cola, no un bucle en proceso:
      // el segundo intento es un job nuevo tras el backoff.
      expect(entrega.attempts).toBe(2);
      expect(entrega.responseStatus).toBe(200);
      expect(recibidos.length).toBe(2);
      expect(fallosPendientesHttp).toBe(0);
    }, 40_000);

    it('mientras queden reintentos la entrega sigue PENDING, no FAILED', async () => {
      const entrega = await admin.webhookDelivery.create({
        data: {
          tenantId,
          endpointId: (
            await admin.webhookEndpoint.findFirstOrThrow({
              where: { tenantId },
            })
          ).id,
          event: 'shipment.status_changed',
          payload: {},
          status: WebhookStatus.PENDING,
        },
      });

      // URL inalcanzable: el intento falla siempre.
      await admin.webhookEndpoint.updateMany({
        where: { tenantId },
        data: { url: 'http://127.0.0.1:1/nope' },
      });

      await expect(
        webhooks.attemptDelivery(tenantId, entrega.id, 1, false),
      ).rejects.toThrow();
      const intermedia = await admin.webhookDelivery.findUniqueOrThrow({
        where: { id: entrega.id },
      });
      expect(intermedia.status).toBe(WebhookStatus.PENDING);
      expect(intermedia.attempts).toBe(1);
      expect(intermedia.lastError).not.toBeNull();

      // Último intento: recién ahí se da por fallida.
      await expect(
        webhooks.attemptDelivery(tenantId, entrega.id, 5, true),
      ).rejects.toThrow();
      const final = await admin.webhookDelivery.findUniqueOrThrow({
        where: { id: entrega.id },
      });
      expect(final.status).toBe(WebhookStatus.FAILED);
      expect(final.attempts).toBe(5);

      await admin.webhookEndpoint.updateMany({
        where: { tenantId },
        data: { url: urlReceptor },
      });
    }, 40_000);

    it('no reenvía una entrega ya marcada como SUCCESS', async () => {
      // Los jobs son at-least-once: un job duplicado no debe repetir el POST.
      const entregada = await admin.webhookDelivery.findFirstOrThrow({
        where: { tenantId, status: WebhookStatus.SUCCESS },
      });
      recibidos = [];

      await webhooks.attemptDelivery(tenantId, entregada.id, 2, false);

      expect(recibidos).toEqual([]);
    });

    it('un job cuyo destino ya no existe se descarta sin lanzar', async () => {
      await expect(
        webhooks.attemptDelivery(tenantId, randomUUID(), 1, false),
      ).resolves.toBeUndefined();
    });
  });

  describe('notificaciones', () => {
    it('el cambio de estado deja la notificación en SENT vía worker', async () => {
      // Los cambios de estado anteriores ya dejaron notificaciones enviadas;
      // hay que esperar una *nueva*, no cualquiera que esté en SENT.
      const antes = proveedor.enviosA(TELEFONO).length;

      await cambiarEstado('IN_TRANSIT');

      // Contar entregas a ESE destinatario es estable aunque queden avisos de
      // pasos anteriores todavia en vuelo.
      await esperarA(
        () =>
          Promise.resolve(
            proveedor.enviosA(TELEFONO).length > antes ? true : null,
          ),
        'el proveedor recibe el aviso del cambio de estado',
      );

      const notificacion = await esperarA(
        async () =>
          (await admin.notification.findFirst({
            where: { tenantId, shipmentId, status: NotificationStatus.SENT },
            orderBy: { createdAt: 'desc' },
          })) ?? null,
        'la notificación llega a SENT',
      );

      expect(notificacion.channel).toBe(NotificationChannel.SMS);
      expect(notificacion.recipient).toBe(TELEFONO);
      expect(notificacion.sentAt).not.toBeNull();
    }, 40_000);

    it('un fallo del proveedor se reintenta hasta enviarse', async () => {
      const destinatario = 'reintento@ejemplo.test';
      proveedor.programarFallos(destinatario, 1); // el primer envio falla

      notifications.dispatch(tenantId, {
        channel: NotificationChannel.EMAIL,
        recipient: destinatario,
        type: 'test.retry',
        body: 'reintento',
      });

      const notificacion = await esperarA(
        async () =>
          (await admin.notification.findFirst({
            where: { tenantId, type: 'test.retry' },
          })) ?? null,
        'la notificación se persiste antes de entregarse',
      );

      await esperarA(async () => {
        const fila = await admin.notification.findUniqueOrThrow({
          where: { id: notificacion.id },
        });
        return fila.status === NotificationStatus.SENT ? fila : null;
      }, 'la notificación se reintenta y llega a SENT');

      // Dos entregas a ESE destinatario: el intento fallido y el reintento.
      expect(proveedor.enviosA(destinatario)).toHaveLength(2);
      expect(proveedor.fallosRestantes(destinatario)).toBe(0);
    }, 40_000);

    it('la fila se persiste como PENDING antes de intentar el envío', async () => {
      // Es lo que hace que una caída de Redis no pierda la notificación: queda
      // registrada en Postgres y es reintentable.
      const destinatario = 'pendiente@ejemplo.test';
      proveedor.programarFallos(destinatario, 99); // nunca se entrega

      notifications.dispatch(tenantId, {
        channel: NotificationChannel.EMAIL,
        recipient: destinatario,
        type: 'test.pending',
        body: 'pendiente',
      });

      const fila = await esperarA(
        async () =>
          (await admin.notification.findFirst({
            where: { tenantId, type: 'test.pending' },
          })) ?? null,
        'la notificación se persiste',
      );

      expect(fila.status).toBe(NotificationStatus.PENDING);
      expect(fila.sentAt).toBeNull();
    }, 40_000);

    it('el envío manual por API sigue siendo síncrono y definitivo', async () => {
      // `POST /notifications` devuelve el resultado final, no un PENDING: el
      // contrato de ese endpoint no cambia al introducir la cola.
      //
      // El destinatario es el correo del OWNER de este tenant y no uno
      // inventado: el endpoint solo acepta direcciones que ya estén en la
      // empresa, para no servir de relay de correo (ver
      // `destinatario-permitido.ts`).
      const res = await request(http)
        .post('/api/notifications')
        .set({ Authorization: `Bearer ${accessToken}` })
        .send({
          channel: 'EMAIL',
          recipient: 'owner@queue.test',
          type: 'test.manual',
          body: 'manual',
        })
        .expect(201);

      expect((res.body as { status: string }).status).toBe(
        NotificationStatus.SENT,
      );
      expect((res.body as { sentAt: string | null }).sentAt).not.toBeNull();
    });

    // Lo que impide que el endpoint sea un relay de correo abierto: sin este
    // filtro, cualquiera que se registre manda correo firmado con nuestro
    // dominio a quien quiera.
    it('rechaza un destinatario que no pertenece a la empresa', async () => {
      await request(http)
        .post('/api/notifications')
        .set({ Authorization: `Bearer ${accessToken}` })
        .send({
          channel: 'EMAIL',
          recipient: 'ajeno@ejemplo.test',
          type: 'test.manual',
          body: 'manual',
        })
        .expect(400);
    });
  });
});
