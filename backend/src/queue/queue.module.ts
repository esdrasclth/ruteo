import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_ATTEMPTS } from './queue.constants';

// Configuración raíz de BullMQ (global: la registran `forRoot*`), compartida por
// todas las colas. Usa su propia conexión a Redis en vez de `RedisService`:
// BullMQ exige `maxRetriesPerRequest: null` para los comandos bloqueantes del
// worker, mientras que `RedisService` está afinado al revés (fail-open rápido
// para el rate limiter).
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          maxRetriesPerRequest: null,
        },
        // Aísla las colas de otros entornos que compartan el mismo Redis (dev
        // y tests, por ejemplo).
        prefix: config.get<string>('QUEUE_PREFIX', 'bull'),
        defaultJobOptions: {
          attempts: DEFAULT_ATTEMPTS,
          backoff: { type: 'exponential', delay: 1000 },
          // Acota lo que queda en Redis: los completados se purgan pronto, los
          // fallidos duran un día para poder inspeccionarlos.
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 86_400 },
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
