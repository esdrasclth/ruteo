import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  JOB_NOTIFICATION_SEND,
  NotificationSendJob,
  QUEUE_NOTIFICATIONS,
} from '../../queue/queue.constants';
import { NotificationsService } from './notifications.service';

@Processor(QUEUE_NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async process(job: Job<NotificationSendJob>): Promise<unknown> {
    if (job.name !== JOB_NOTIFICATION_SEND) {
      this.logger.warn(
        `Job desconocido en la cola de notificaciones: ${job.name}`,
      );
      return undefined;
    }

    const intento = job.attemptsMade + 1;
    const maxIntentos = job.opts.attempts ?? 1;
    const notification = await this.notifications.deliver(
      job.data.tenantId,
      job.data.notificationId,
      intento >= maxIntentos,
    );

    return { status: notification?.status ?? 'discarded' };
  }
}
