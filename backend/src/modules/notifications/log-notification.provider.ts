import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationMessage,
  NotificationProvider,
  NotificationSendResult,
} from './notification-provider';

// Default provider: "delivers" by logging. Lets the whole notification pipeline
// run end-to-end without external accounts (Firebase/Twilio/SES).
@Injectable()
export class LogNotificationProvider implements NotificationProvider {
  readonly name = 'log';
  private readonly logger = new Logger('Notification');

  send(message: NotificationMessage): Promise<NotificationSendResult> {
    this.logger.log(
      `[${message.channel}] -> ${message.recipient}: ${message.title ?? ''} ${message.body}`,
    );
    return Promise.resolve({ ok: true });
  }
}
