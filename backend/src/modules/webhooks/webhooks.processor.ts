import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  JOB_WEBHOOK_DELIVER,
  JOB_WEBHOOK_FANOUT,
  QUEUE_WEBHOOKS,
  WebhookDeliverJob,
  WebhookFanoutJob,
} from '../../queue/queue.constants';
import { WebhooksService } from './webhooks.service';

type WebhookJob = Job<WebhookFanoutJob | WebhookDeliverJob>;

@Processor(QUEUE_WEBHOOKS)
export class WebhooksProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhooksProcessor.name);

  constructor(private readonly webhooks: WebhooksService) {
    super();
  }

  async process(job: WebhookJob): Promise<unknown> {
    switch (job.name) {
      case JOB_WEBHOOK_FANOUT:
        return this.webhooks.fanOut(job.data as WebhookFanoutJob);

      case JOB_WEBHOOK_DELIVER: {
        const { tenantId, deliveryId } = job.data as WebhookDeliverJob;
        // `attemptsMade` cuenta los intentos ya consumidos, así que el actual
        // es el siguiente; el worker necesita saber si es el último para
        // decidir entre dejar la entrega PENDING (habrá reintento) o FAILED.
        const intento = job.attemptsMade + 1;
        const maxIntentos = job.opts.attempts ?? 1;
        await this.webhooks.attemptDelivery(
          tenantId,
          deliveryId,
          intento,
          intento >= maxIntentos,
        );
        return { delivered: true };
      }

      default:
        this.logger.warn(`Job desconocido en la cola de webhooks: ${job.name}`);
        return undefined;
    }
  }
}
