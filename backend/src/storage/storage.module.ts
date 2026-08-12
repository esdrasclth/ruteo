import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

// Global como `RedisModule`: lo van a inyectar bodega, aduana, entregas,
// excepciones y reclamos. Importarlo módulo por módulo sería repetir la misma
// línea en seis sitios sin ganar nada.
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
