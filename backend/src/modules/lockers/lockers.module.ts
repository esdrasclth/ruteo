import { Module } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtOrApiKeyGuard } from '../../common/guards/jwt-or-api-key.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { CustomersModule } from '../customers/customers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LockersController } from './lockers.controller';
import { LockersService } from './lockers.service';

@Module({
  imports: [NotificationsModule, CustomersModule],
  controllers: [LockersController],
  providers: [
    LockersService,
    JwtAuthGuard,
    ApiKeyGuard,
    JwtOrApiKeyGuard,
    RateLimitGuard,
  ],
  exports: [LockersService],
})
export class LockersModule {}
