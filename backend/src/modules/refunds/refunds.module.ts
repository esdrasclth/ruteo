import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';

@Module({
  imports: [AuditModule],
  controllers: [RefundsController],
  providers: [RefundsService],
  // Lo exporta para los reclamos: liquidar uno emite el reembolso dentro de la
  // misma transacción, así que necesita el servicio y no el endpoint.
  exports: [RefundsService],
})
export class RefundsModule {}
