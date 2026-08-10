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

  onModuleInit() {
    // Se programa al arrancar y no con un cron del sistema para que la limpieza
    // viaje con la aplicación: un despliegue nuevo no depende de que alguien se
    // acuerde de instalar una entrada en el crontab del VPS.
    //
    // **No se espera a que termine, y esto importa.** `queue.add` contra un
    // Redis que no responde NO falla: BullMQ está configurado con
    // `maxRetriesPerRequest: null` y reintenta indefinidamente, así que la
    // promesa nunca se resuelve ni se rechaza. Con un `await` aquí, el arranque
    // se quedaba colgado y el backend no llegaba a escuchar —comprobado
    // levantando el stack con la contraseña de Redis mal puesta: el contenedor
    // se quedaba en `health: starting` para siempre—.
    //
    // Programar una tarea de mantenimiento no puede costar el servicio entero.
    void this.programarPurga();
  }

  private async programarPurga(): Promise<void> {
    // La carrera es solo para poder DECIR que no se programó. Sin ella el fallo
    // es invisible: ni excepción, ni log, ni purga.
    const tiempoAgotado = new Promise<never>((_, rechazar) => {
      const t = setTimeout(
        () => rechazar(new Error('Redis no respondió a tiempo')),
        15_000,
      );
      // Sin `unref`, este temporizador mantendría vivo el proceso 15 segundos
      // más de la cuenta al apagar.
      t.unref();
    });

    try {
      await Promise.race([
        this.cola.add(
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
        ),
        tiempoAgotado,
      ]);
    } catch (e) {
      this.log.warn(
        `No se pudo programar la purga de idempotencia (se reintentará en el ` +
          `próximo arranque): ${String(e)}`,
      );
    }
  }
}
