import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { WebhookStatus } from '@prisma/client';
import { createHmac, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

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

  constructor(private readonly prisma: PrismaService) {}

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
  // status change). Never throws — failures are logged and recorded as delivery
  // rows so they don't break the originating request.
  dispatch(tenantId: string, event: string, payload: Record<string, unknown>) {
    void this.deliver(tenantId, event, payload).catch((err) =>
      this.logger.error(`Webhook dispatch failed: ${String(err)}`),
    );
  }

  private async deliver(
    tenantId: string,
    event: string,
    payload: Record<string, unknown>,
  ) {
    const endpoints = await this.prisma.withTenant(tenantId, (tx) =>
      tx.webhookEndpoint.findMany({
        where: { active: true, events: { has: event } },
        select: { id: true, url: true, secret: true },
      }),
    );

    for (const endpoint of endpoints) {
      const body = JSON.stringify({
        event,
        sentAt: new Date().toISOString(),
        data: payload,
      });
      const signature = createHmac('sha256', endpoint.secret)
        .update(body)
        .digest('hex');

      let attempts = 0;
      let responseStatus: number | null = null;
      let lastError: string | null = null;
      let status: WebhookStatus = WebhookStatus.FAILED;

      while (attempts < MAX_ATTEMPTS) {
        attempts++;
        try {
          const res = await fetch(endpoint.url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-ruteo-event': event,
              'x-ruteo-signature': `sha256=${signature}`,
            },
            body,
            signal: AbortSignal.timeout(5000),
          });
          responseStatus = res.status;
          if (res.ok) {
            status = WebhookStatus.SUCCESS;
            lastError = null;
            break;
          }
          lastError = `HTTP ${res.status}`;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
        if (attempts < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempts));
        }
      }

      await this.prisma
        .withTenant(tenantId, (tx) =>
          tx.webhookDelivery.create({
            data: {
              tenantId,
              endpointId: endpoint.id,
              event,
              payload: payload as object,
              status,
              attempts,
              responseStatus,
              lastError,
            },
          }),
        )
        .catch((err) =>
          this.logger.error(`Failed to record webhook delivery: ${String(err)}`),
        );
    }
  }
}
