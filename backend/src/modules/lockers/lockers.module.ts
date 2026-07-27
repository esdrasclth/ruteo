import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LockersController } from './lockers.controller';
import { LockersService } from './lockers.service';

@Module({
  imports: [NotificationsModule, CustomersModule],
  controllers: [LockersController],
  providers: [LockersService],
  exports: [LockersService],
})
export class LockersModule {}
