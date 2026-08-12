import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  JOB_AVISAR_PRUEBAS,
  JOB_CADUCAR_PRUEBAS,
  QUEUE_FACTURACION,
} from '../../queue/queue.constants';
import { AvisosPruebaService } from './avisos-prueba.service';
import { BillingService } from './billing.service';

/**
 * El ÚNICO procesador de la cola de facturación.
 *
 * Los dos trabajos van aquí y no en dos clases: en BullMQ cada `@Processor`
 * sobre la misma cola levanta su propio worker y todos compiten por TODOS los
 * jobs sin mirar el nombre, así que dos clases significarían que cada una puede
 * quedarse el trabajo de la otra, no reconocerlo y darlo por completado sin
 * hacer nada. Ver el aviso en `queue.constants.ts`.
 */
@Processor(QUEUE_FACTURACION)
export class BillingProcessor extends WorkerHost {
  private readonly log = new Logger(BillingProcessor.name);

  constructor(
    private readonly facturacion: BillingService,
    private readonly avisos: AvisosPruebaService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case JOB_CADUCAR_PRUEBAS:
        return { caducadas: await this.facturacion.caducarPruebas() };
      case JOB_AVISAR_PRUEBAS:
        return { avisadas: await this.avisos.avisarPruebasPorVencer() };
      default:
        this.log.warn(`Job desconocido en la cola de facturación: ${job.name}`);
        return undefined;
    }
  }
}
