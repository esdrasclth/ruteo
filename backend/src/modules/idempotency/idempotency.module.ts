import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  JOB_PURGAR_IDEMPOTENCIA,
  QUEUE_MANTENIMIENTO,
} from '../../queue/queue.constants';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyProcessor } from './idempotency.processor';
import { IdempotencyService } from './idempotency.service';

/** Cada cuánto se barren las claves vencidas. */
const CADA_MS = 60 * 60 * 1000;

/**
 * Clave de repetición FIJA.
 *
 * BullMQ identifica un job repetible por esta clave, así que reiniciar el
 * backend no acumula programaciones duplicadas y, con varias instancias, todas
 * registran la misma y solo una la ejecuta.
 */
const CLAVE_REPETICION = 'purga-idempotencia';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_MANTENIMIENTO })],
  providers: [IdempotencyService, IdempotencyInterceptor, IdempotencyProcessor],
  exports: [IdempotencyService, IdempotencyInterceptor],
})
export class IdempotencyModule implements OnModuleInit {
  private readonly log = new Logger(IdempotencyModule.name);

  constructor(@InjectQueue(QUEUE_MANTENIMIENTO) private readonly cola: Queue) {}

  async onModuleInit() {
    // Se programa al arrancar y no con un cron del sistema para que la limpieza
    // viaje con la aplicación: un despliegue nuevo no depende de que alguien se
    // acuerde de instalar una entrada en el crontab del VPS.
    //
    // Si Redis no está, no se programa y se registra. No se tira el arranque:
    // dejar la API caída por una tarea de mantenimiento sería peor que la tarea
    // que intenta evitar.
    try {
      await this.cola.add(
        JOB_PURGAR_IDEMPOTENCIA,
        {},
        {
          repeat: { every: CADA_MS, key: CLAVE_REPETICION },
          removeOnComplete: true,
          removeOnFail: 20,
          // Una purga fallida no se reintenta: en una hora vuelve sola, y
          // reintentar un DELETE masivo contra una base con problemas es
          // empujar justo donde duele.
          attempts: 1,
        },
      );
    } catch (e) {
      this.log.warn(
        `No se pudo programar la purga de idempotencia: ${String(e)}`,
      );
    }
  }
}
