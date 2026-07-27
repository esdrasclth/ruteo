import { NotificationChannel } from '@prisma/client';

export const NOTIFICATION_PROVIDER = 'NOTIFICATION_PROVIDER';

export interface NotificationMessage {
  channel: NotificationChannel;
  recipient: string;
  title: string | null;
  body: string;
}

export interface NotificationSendResult {
  ok: boolean;
  error?: string;
}

// Seam between our notification domain and the real delivery channels. Firebase
// (push), Twilio (SMS/WhatsApp) or SES (email) plug in here without touching the
// service. The default LogNotificationProvider keeps everything local/testable.
export interface NotificationProvider {
  readonly name: string;
  send(message: NotificationMessage): Promise<NotificationSendResult>;
}
