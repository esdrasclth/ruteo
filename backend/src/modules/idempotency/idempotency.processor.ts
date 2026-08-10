import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  JOB_PURGAR_IDEMPOTENCIA,
  QUEUE_MANTENIMIENTO,
} from '../../queue/queue.constants';
import { IdempotencyService } from './idempotency.service';

@Processor(QUEUE_MANTENIMIENTO)
export class IdempotencyProcessor extends WorkerHost {
  private readonly log = new Logger(IdempotencyProcessor.name);

  constructor(private readonly idempotencia: IdempotencyService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name !== JOB_PURGAR_IDEMPOTENCIA) {
      this.log.warn(`Job desconocido en la cola de mantenimiento: ${job.name}`);
      return undefined;
    }
    return { borradas: await this.idempotencia.purgarVencidas() };
  }
}
