import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WebhookStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { createHmac, randomBytes } from 'node:crypto';
import { TOPE_CATALOGO } from '../../common/dto/paginacion.dto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DestinoNoPermitido,
  enviarAlDestino,
  validarDestinoWebhook,
  type DestinoValidado,
} from './destino-seguro';
import {
  JOB_WEBHOOK_DELIVER,
  JOB_WEBHOOK_FANOUT,
  QUEUE_WEBHOOKS,
  WebhookFanoutJob,
} from '../../queue/queue.constants';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';

const REQUEST_TIMEOUT_MS = 5000;

const endpointPublicSelect = {
  id: true,
  url: true,
  events: true,
  active: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_WEBHOOKS) private readonly queue: Queue,
  ) {}

  // Solo para desarrollo: deja apuntar a un servidor local. En producción va en
  // `false` y el destino se filtra de verdad.
  private get permitirPrivados(): boolean {
    return (
      this.config.get<string>('WEBHOOKS_PERMITIR_DESTINOS_PRIVADOS') === 'true'
    );
  }

  // El error de destino se traduce a 400: es un fallo de lo que escribió el
  // usuario, no del servidor, y el mensaje le dice exactamente qué corregir.
  private async validarUrl(url: string): Promise<void> {
    try {
      await validarDestinoWebhook(url, this.permitirPrivados);
    } catch (err) {
      if (err instanceof DestinoNoPermitido) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  async create(tenantId: string, dto: CreateWebhookDto) {
    await this.validarUrl(dto.url);
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.webhookEndpoint.create({
        data: {
          tenantId,
          url: dto.url,
          events: dto.events,
          secret,
        },
        select: { ...endpointPublicSelect, secret: true },
      }),
    );
  }

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.webhookEndpoint.findMany({
        orderBy: { createdAt: 'desc' },
        select: endpointPublicSelect,
        take: TOPE_CATALOGO,
      }),
    );
  }

  async findOne(tenantId: string, id: string) {
    const endpoint = await this.prisma.withTenant(tenantId, (tx) =>
      tx.webhookEndpoint.findUnique({
        where: { id },
        select: endpointPublicSelect,
      }),
    );
    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    return endpoint;
  }

  async update(tenantId: string, id: string, dto: UpdateWebhookDto) {
    await this.findOne(tenantId, id);
    if (dto.url !== undefined) {
      await this.validarUrl(dto.url);
    }
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.webhookEndpoint.update({
        where: { id },
        data: {
          url: dto.url,
          events: dto.events,
          active: dto.active,
        },
        select: endpointPublicSelect,
      }),
    );
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.webhookEndpoint.delete({ where: { id } }),
    );
    return { deleted: true };
  }

  // Fire-and-forget entry point: called after a domain event (e.g. a shipment
  // status change). Solo encola; el envío HTTP y sus reintentos corren en el
  // worker. Nunca lanza, para no romper la petición que originó el evento.
  dispatch(tenantId: string, event: string, payload: Record<string, unknown>) {
    const job: WebhookFanoutJob = { tenantId, event, payload };
    void this.queue.add(JOB_WEBHOOK_FANOUT, job).catch((err: Error) =>
      // Sin Redis no hay entrega: se registra en alto para que sea visible en
      // los logs, porque en este punto todavía no existe fila de delivery.
      this.logger.error(
        `No se pudo encolar el webhook ${event} del tenant ${tenantId}: ${err.message}`,
      ),
    );
  }

  // Etapa 1 (worker): resuelve los endpoints suscritos, deja una fila PENDING
  // por cada uno —el registro durable del intento— y encola su entrega.
  async fanOut(job: WebhookFanoutJob): Promise<{ queued: number }> {
    const { tenantId, event, payload } = job;
    const endpoints = await this.prisma.withTenant(tenantId, (tx) =>
      tx.webhookEndpoint.findMany({
        where: { active: true, events: { has: event } },
        select: { id: true },
      }),
    );

    for (const endpoint of endpoints) {
      const delivery = await this.prisma.withTenant(tenantId, (tx) =>
        tx.webhookDelivery.create({
          data: {
            tenantId,
            endpointId: endpoint.id,
            event,
            payload: payload as Prisma.InputJsonValue,
            status: WebhookStatus.PENDING,
          },
          select: { id: true },
        }),
      );
      await this.queue.add(JOB_WEBHOOK_DELIVER, {
        tenantId,
        deliveryId: delivery.id,
      });
    }

    return { queued: endpoints.length };
  }

  // Etapa 2 (worker): un intento de entrega contra un endpoint. Lanza si falla
  // para que BullMQ reintente; marca FAILED solo cuando ya no quedan intentos.
  async attemptDelivery(
    tenantId: string,
    deliveryId: string,
    attempt: number,
    isLastAttempt: boolean,
  ): Promise<void> {
    const delivery = await this.prisma.withTenant(tenantId, (tx) =>
      tx.webhookDelivery.findUnique({
        where: { id: deliveryId },
        include: { endpoint: { select: { url: true, secret: true } } },
      }),
    );

    if (!delivery) {
      // El tenant o el endpoint se borró mientras el job esperaba en la cola.
      this.logger.warn(`Delivery ${deliveryId} ya no existe; se descarta`);
      return;
    }
    if (delivery.status === WebhookStatus.SUCCESS) {
      return; // Ya entregado: los jobs son at-least-once, no repetimos el POST.
    }

    // Se revalida el destino AQUÍ y no solo al dar de alta el endpoint: entre
    // el alta y este envío, el dominio pudo repuntarse a una IP interna (DNS
    // rebinding). Si ya no vale, se marca FAILED y NO se reintenta: reintentar
    // un destino prohibido es repetir el intento de SSRF cada pocos segundos.
    //
    // La IP que devuelve es contra la que se conecta unas líneas más abajo. Ese
    // acarreo es el arreglo: comprobar y luego dejar que la librería HTTP
    // resuelva por su cuenta deja una segunda resolución en manos del dueño del
    // dominio, y con ella la carrera que todo esto quiere evitar.
    let destino: DestinoValidado;
    try {
      destino = await validarDestinoWebhook(
        delivery.endpoint.url,
        this.permitirPrivados,
      );
    } catch (err) {
      if (err instanceof DestinoNoPermitido) {
        this.logger.warn(
          `Entrega ${deliveryId} descartada: destino no permitido (${err.message})`,
        );
        await this.recordAttempt(tenantId, deliveryId, {
          status: WebhookStatus.FAILED,
          attempts: attempt,
          responseStatus: null,
          lastError: `Destino no permitido: ${err.message}`,
        });
        return;
      }
      throw err;
    }

    const body = JSON.stringify({
      event: delivery.event,
      sentAt: new Date().toISOString(),
      data: delivery.payload,
    });
    const signature = createHmac('sha256', delivery.endpoint.secret)
      .update(body)
      .digest('hex');

    let responseStatus: number | null = null;
    let lastError: string | null = null;

    try {
      const res = await enviarAlDestino(delivery.endpoint.url, destino, {
        headers: {
          'content-type': 'application/json',
          'x-ruteo-event': delivery.event,
          'x-ruteo-signature': `sha256=${signature}`,
        },
        body,
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
      responseStatus = res.status;
      // Las redirecciones no se siguen —`enviarAlDestino` no las sigue nunca—,
      // porque son la otra forma de esquivar el filtro: el endpoint pasa la
      // comprobación apuntando a una IP pública y contesta con un 302 hacia
      // 169.254.169.254. Un receptor de webhooks no necesita redirigir.
      if (res.status >= 300 && res.status < 400) {
        lastError = `El endpoint respondió con un redirect (${res.status}); no se siguen.`;
      } else if (res.status < 200 || res.status >= 300) {
        lastError = `HTTP ${res.status}`;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    const entregado = lastError === null;
    await this.recordAttempt(tenantId, deliveryId, {
      status: entregado
        ? WebhookStatus.SUCCESS
        : isLastAttempt
          ? WebhookStatus.FAILED
          : WebhookStatus.PENDING,
      attempts: attempt,
      responseStatus,
      lastError,
    });

    if (!entregado) {
      throw new Error(lastError ?? 'Webhook delivery failed');
    }
  }

  private async recordAttempt(
    tenantId: string,
    deliveryId: string,
    data: {
      status: WebhookStatus;
      attempts: number;
      responseStatus: number | null;
      lastError: string | null;
    },
  ) {
    await this.prisma
      .withTenant(tenantId, (tx) =>
        tx.webhookDelivery.update({ where: { id: deliveryId }, data }),
      )
      .catch((err: Error) =>
        this.logger.error(
          `No se pudo registrar el intento de entrega ${deliveryId}: ${err.message}`,
        ),
      );
  }
}
