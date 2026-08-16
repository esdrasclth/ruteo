import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ShipmentsModule } from '../shipments/shipments.module';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';

@Module({
  // `ShipmentsModule` porque completar una devolución mueve el estado del
  // envío, y eso pasa por `ShipmentsService` y no por un update a mano: ahí
  // viven los eventos, las notificaciones y los webhooks del cambio de estado.
  imports: [ShipmentsModule, AuditModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
