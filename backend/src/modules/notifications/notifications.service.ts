import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { NOTIFICATION_PROVIDER } from './notification-provider';
import type { NotificationProvider } from './notification-provider';

export interface NotifyInput {
  channel: NotificationChannel;
  recipient: string;
  type: string;
  title?: string | null;
  body: string;
  shipmentId?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_PROVIDER)
    private readonly provider: NotificationProvider,
  ) {}

  // Persists a notification, attempts delivery through the configured provider,
  // and records the outcome. Returns the stored row.
  async notify(tenantId: string, input: NotifyInput) {
    const created = await this.prisma.withTenant(tenantId, (tx) =>
      tx.notification.create({
        data: {
          tenantId,
          shipmentId: input.shipmentId ?? null,
          channel: input.channel,
          recipient: input.recipient,
          type: input.type,
          title: input.title ?? null,
          body: input.body,
          provider: this.provider.name,
        },
      }),
    );

    let status: NotificationStatus = NotificationStatus.SENT;
    let error: string | null = null;
    try {
      const result = await this.provider.send({
        channel: input.channel,
        recipient: input.recipient,
        title: input.title ?? null,
        body: input.body,
      });
      if (!result.ok) {
        status = NotificationStatus.FAILED;
        error = result.error ?? 'Provider reported failure';
      }
    } catch (err) {
      status = NotificationStatus.FAILED;
      error = err instanceof Error ? err.message : String(err);
    }

    return this.prisma.withTenant(tenantId, (tx) =>
      tx.notification.update({
        where: { id: created.id },
        data: {
          status,
          error,
          sentAt: status === NotificationStatus.SENT ? new Date() : null,
        },
      }),
    );
  }

  // Fire-and-forget entry point for domain events (e.g. shipment status change).
  // Never throws — failures are logged so they don't break the originating request.
  dispatch(tenantId: string, input: NotifyInput) {
    void this.notify(tenantId, input).catch((err) =>
      this.logger.error(`Notification dispatch failed: ${String(err)}`),
    );
  }

  list(
    tenantId: string,
    filters: { status?: NotificationStatus; channel?: NotificationChannel },
  ) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.notification.findMany({
        where: {
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.channel ? { channel: filters.channel } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }

  send(tenantId: string, dto: SendNotificationDto) {
    return this.notify(tenantId, dto);
  }
}
