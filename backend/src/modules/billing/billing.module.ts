import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PaymentsModule } from '../payments/payments.module';
import { BILLING_PROVIDER } from './billing-provider';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { ManualBillingProvider } from './manual-billing.provider';

@Module({
  imports: [PaymentsModule, AuditModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    { provide: BILLING_PROVIDER, useClass: ManualBillingProvider },
  ],
  exports: [BillingService],
})
export class BillingModule {}
