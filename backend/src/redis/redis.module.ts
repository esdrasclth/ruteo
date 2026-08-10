import { Global, Module } from '@nestjs/common';
import { VentanaMemoria } from '../common/ventana-memoria';
import { RedisService } from './redis.service';

// `VentanaMemoria` vive aquí y no en un módulo propio porque es exactamente el
// respaldo de las operaciones de `RedisService` que sostienen los frenos de
// credencial: quien inyecta una casi siempre inyecta la otra, y tenerlas juntas
// hace evidente que la segunda existe para cuando la primera no responde.
@Global()
@Module({
  providers: [RedisService, VentanaMemoria],
  exports: [RedisService, VentanaMemoria],
})
export class RedisModule {}
