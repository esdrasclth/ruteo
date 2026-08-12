import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  JOB_AVISAR_PRUEBAS,
  JOB_CADUCAR_PRUEBAS,
  QUEUE_FACTURACION,
} from '../../queue/queue.constants';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { AvisosPruebaService } from './avisos-prueba.service';
import { BILLING_PROVIDER } from './billing-provider';
import { BillingController } from './billing.controller';
import { BillingProcessor } from './billing.processor';
import { BillingService } from './billing.service';
import { ManualBillingProvider } from './manual-billing.provider';
import { PublicPlansController } from './public-plans.controller';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';

/**
 * Cada cuánto se barren las pruebas vencidas. Seis horas: una prueba que dura
 * catorce días no necesita precisión al minuto, y el acceso ya lo corta
 * `planEfectivo` en la primera petición tras el vencimiento.
 */
const CADA_MS = 6 * 60 * 60 * 1000;

/**
 * Cada cuánto se busca a quién avisar. Doce horas basta para un aviso con tres
 * días de antelación, y el aviso es de una sola vez (`trialWarnedAt`), así que
 * pasar más a menudo no manda más correos: solo consulta más.
 */
const AVISOS_CADA_MS = 12 * 60 * 60 * 1000;

/** Claves fijas: reiniciar el backend no debe acumular programaciones. */
const CLAVE_REPETICION = 'caducar-pruebas';
const CLAVE_AVISOS = 'avisar-pruebas';

@Module({
  imports: [
    PaymentsModule,
    AuditModule,
    // Para el aviso de vencimiento: mismo proveedor y mismo registro que el
    // resto de correos del sistema.
    NotificationsModule,
    BullModule.registerQueue({ name: QUEUE_FACTURACION }),
  ],
  controllers: [BillingController, PublicPlansController],
  providers: [
    BillingService,
    AvisosPruebaService,
    BillingProcessor,
    PublicRateLimitGuard,
    { provide: BILLING_PROVIDER, useClass: ManualBillingProvider },
  ],
  exports: [BillingService],
})
export class BillingModule implements OnModuleInit {
  private readonly log = new Logger(BillingModule.name);

  constructor(@InjectQueue(QUEUE_FACTURACION) private readonly cola: Queue) {}

  onModuleInit() {
    void this.programar(JOB_CADUCAR_PRUEBAS, CLAVE_REPETICION, CADA_MS);
    void this.programar(JOB_AVISAR_PRUEBAS, CLAVE_AVISOS, AVISOS_CADA_MS);
  }

  private async programar(
    job: string,
    clave: string,
    cada: number,
  ): Promise<void> {
    // Sin esperar el resultado, y con carrera contra un reloj: `queue.add`
    // contra un Redis que no responde NO falla —BullMQ reintenta
    // indefinidamente— y un `await` a secas dejaría el arranque colgado sin
    // llegar a escuchar. Es la misma trampa documentada en `IdempotencyModule`,
    // que allí costó un contenedor en `health: starting` para siempre.
    const tiempoAgotado = new Promise<never>((_, rechazar) => {
      const t = setTimeout(
        () => rechazar(new Error('Redis no respondió a tiempo')),
        15_000,
      );
      t.unref();
    });

    try {
      await Promise.race([
        this.cola.add(
          job,
          {},
          {
            repeat: { every: cada, key: clave },
            removeOnComplete: true,
            removeOnFail: 20,
            // No se reintenta: vuelve sola en la siguiente pasada. Reintentar un
            // aviso significa arriesgarse a mandarlo dos veces, y el acceso no
            // depende de que la caducidad corra —lo resuelve `planEfectivo`—.
            attempts: 1,
          },
        ),
        tiempoAgotado,
      ]);
    } catch (e) {
      this.log.warn(
        `No se pudo programar ${job} (se reintentará en el próximo ` +
          `arranque): ${String(e)}`,
      );
    }
  }
}
