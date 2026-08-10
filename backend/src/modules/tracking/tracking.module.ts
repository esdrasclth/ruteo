import { Module } from '@nestjs/common';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

// El guard va en `providers` como en `AuthModule` y `PlatformModule`: lo que
// inyecta (RedisService y VentanaMemoria) es global, pero el guard en sí lo
// instancia el módulo que declara el controlador.
@Module({
  controllers: [TrackingController],
  providers: [TrackingService, PublicRateLimitGuard],
})
export class TrackingModule {}
