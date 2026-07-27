import { Module } from '@nestjs/common';
import { LogNotificationProvider } from './log-notification.provider';
import { NOTIFICATION_PROVIDER } from './notification-provider';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: NOTIFICATION_PROVIDER, useClass: LogNotificationProvider },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
