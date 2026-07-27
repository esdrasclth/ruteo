import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtOrApiKeyGuard } from '../../common/guards/jwt-or-api-key.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { PaymentsModule } from '../payments/payments.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingModule } from '../billing/billing.module';
import { AuditModule } from '../audit/audit.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';

@Module({
  imports: [
    SearchModule,
    RealtimeModule,
    PaymentsModule,
    WebhooksModule,
    NotificationsModule,
    BillingModule,
    AuditModule,
    IdempotencyModule,
  ],
  controllers: [ShipmentsController],
  providers: [
    ShipmentsService,
    JwtAuthGuard,
    ApiKeyGuard,
    JwtOrApiKeyGuard,
    RateLimitGuard,
  ],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
