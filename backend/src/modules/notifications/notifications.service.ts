import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  Notification,
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { Pagina, PaginacionDto, saltar } from '../../common/dto/paginacion.dto';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import {
  JOB_NOTIFICATION_SEND,
  NotificationSendJob,
  QUEUE_NOTIFICATIONS,
} from '../../queue/queue.constants';
import { comprobarDestinatario } from './destinatario-permitido';
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
    @InjectQueue(QUEUE_NOTIFICATIONS) private readonly queue: Queue,
  ) {}

  // Persists a notification, attempts delivery through the configured provider,
  // and records the outcome. Returns the stored row. Camino síncrono: lo usa el
  // envío manual por API, que espera un resultado definitivo y no reintenta.
  async notify(tenantId: string, input: NotifyInput) {
    const created = await this.createPending(tenantId, input);
    return this.deliver(tenantId, created.id, true);
  }

  // Fire-and-forget entry point for domain events (e.g. shipment status change).
  // Never throws — failures are logged so they don't break the originating request.
  // La fila se persiste aquí (queda PENDING) y el envío se encola: si Redis está
  // caído la notificación no se pierde, queda pendiente y es reintentable.
  dispatch(tenantId: string, input: NotifyInput) {
    void this.enqueue(tenantId, input).catch((err: Error) =>
      this.logger.error(`Notification dispatch failed: ${err.message}`),
    );
  }

  private async enqueue(tenantId: string, input: NotifyInput) {
    const created = await this.createPending(tenantId, input);
    const job: NotificationSendJob = {
      tenantId,
      notificationId: created.id,
    };
    await this.queue.add(JOB_NOTIFICATION_SEND, job);
  }

  private createPending(tenantId: string, input: NotifyInput) {
    return this.prisma.withTenant(tenantId, (tx) =>
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
  }

  // Un intento de entrega contra el proveedor configurado. Marca FAILED solo si
  // ya no quedan reintentos; si no, la deja PENDING y lanza para que BullMQ la
  // reencole.
  async deliver(
    tenantId: string,
    notificationId: string,
    isLastAttempt: boolean,
  ) {
    const notification = await this.prisma.withTenant(tenantId, (tx) =>
      tx.notification.findUnique({ where: { id: notificationId } }),
    );

    if (!notification) {
      // El tenant se borró mientras el job esperaba en la cola.
      this.logger.warn(
        `Notificación ${notificationId} ya no existe; se descarta`,
      );
      return null;
    }
    if (notification.status === NotificationStatus.SENT) {
      return notification; // Los jobs son at-least-once; no reenviamos.
    }

    let error: string | null = null;
    try {
      const result = await this.provider.send({
        channel: notification.channel,
        recipient: notification.recipient,
        title: notification.title,
        body: notification.body,
      });
      if (!result.ok) {
        error = result.error ?? 'Provider reported failure';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const enviada = error === null;
    const updated = await this.prisma.withTenant(tenantId, (tx) =>
      tx.notification.update({
        where: { id: notificationId },
        data: {
          status: enviada
            ? NotificationStatus.SENT
            : isLastAttempt
              ? NotificationStatus.FAILED
              : NotificationStatus.PENDING,
          error,
          sentAt: enviada ? new Date() : null,
        },
      }),
    );

    if (!enviada && !isLastAttempt) {
      throw new Error(error ?? 'Notification delivery failed');
    }
    return updated;
  }

  /**
   * El historial de avisos, paginado.
   *
   * Es de los listados que más rápido crecen —uno por cada cambio de estado de
   * cada envío—, así que el `take: 100` que había se agotaba en días. Y la
   * pantalla cuenta los fallidos sobre lo que recibe: con el corte mudo, «12
   * fallidas» significaba «12 de las últimas 100», no del total.
   */
  async list(
    tenantId: string,
    filters: {
      status?: NotificationStatus;
      channel?: NotificationChannel;
      shipmentId?: string;
    } & PaginacionDto,
  ): Promise<Pagina<Notification>> {
    const where: Prisma.NotificationWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.channel ? { channel: filters.channel } : {}),
      ...(filters.shipmentId ? { shipmentId: filters.shipmentId } : {}),
    };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: saltar(filters),
          take: filters.pageSize,
        }),
        tx.notification.count({ where }),
      ]);

      return { items, total, page: filters.page, pageSize: filters.pageSize };
    });
  }

  /**
   * Envío manual desde la API. **Es el único punto donde el destinatario lo
   * escribe una persona**, así que es el único que necesita comprobarlo.
   *
   * `dispatch` no pasa por aquí a propósito: su destinatario sale del envío que
   * originó el evento, ya está dentro de los datos de la empresa, y añadirle una
   * consulta por aviso sería pagar en cada cambio de estado por un control que
   * ahí no aporta nada.
   */
  async send(tenantId: string, dto: SendNotificationDto) {
    const veredicto = await this.prisma.withTenant(tenantId, (tx) =>
      comprobarDestinatario(tx, dto.channel, dto.recipient),
    );
    if (!veredicto.permitido) {
      throw new BadRequestException(veredicto.motivo);
    }
    return this.notify(tenantId, dto);
  }
}
