import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { PlatformModule } from './modules/platform/platform.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { ShipmentsModule } from './modules/shipments/shipments.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { CarriersModule } from './modules/carriers/carriers.module';
import { GeocodingModule } from './modules/geocoding/geocoding.module';
import { RoutingModule } from './modules/routing/routing.module';
import { LockersModule } from './modules/lockers/lockers.module';
import { CustomersModule } from './modules/customers/customers.module';
import { UsersModule } from './modules/users/users.module';
import { ConsolidationModule } from './modules/consolidation/consolidation.module';
import { CustomsModule } from './modules/customs/customs.module';
import { ZonesModule } from './modules/zones/zones.module';
import { RatesModule } from './modules/rates/rates.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { RoutesModule } from './modules/routes/routes.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { BillingModule } from './modules/billing/billing.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { SearchModule } from './modules/search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    RedisModule,
    QueueModule,
    TenantsModule,
    AuthModule,
    PlatformModule,
    ShipmentsModule,
    TrackingModule,
    CarriersModule,
    GeocodingModule,
    RoutingModule,
    LockersModule,
    CustomersModule,
    UsersModule,
    ConsolidationModule,
    CustomsModule,
    ZonesModule,
    RatesModule,
    DriversModule,
    RoutesModule,
    PaymentsModule,
    ApiKeysModule,
    WebhooksModule,
    BillingModule,
    NotificationsModule,
    AnalyticsModule,
    AuditModule,
    SearchModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
