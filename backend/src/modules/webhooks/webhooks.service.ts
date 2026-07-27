import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, WebhookStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { createHmac, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
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
    @InjectQueue(QUEUE_WEBHOOKS) private readonly queue: Queue,
  ) {}

  create(tenantId: string, dto: CreateWebhookDto) {
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
      const res = await fetch(delivery.endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ruteo-event': delivery.event,
          'x-ruteo-signature': `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      responseStatus = res.status;
      if (!res.ok) {
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
