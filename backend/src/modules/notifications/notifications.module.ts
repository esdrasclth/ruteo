import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_NOTIFICATIONS } from '../../queue/queue.constants';
import { LogNotificationProvider } from './log-notification.provider';
import { NOTIFICATION_PROVIDER } from './notification-provider';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS })],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    { provide: NOTIFICATION_PROVIDER, useClass: LogNotificationProvider },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
