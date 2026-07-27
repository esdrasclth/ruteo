export const QUEUE_WEBHOOKS = 'webhooks';
export const QUEUE_NOTIFICATIONS = 'notifications';

// Un webhook se despacha en dos etapas: `fanout` resuelve qué endpoints del
// tenant escuchan el evento y encola un `deliver` por cada uno, de modo que un
// endpoint lento o caído no bloquea ni reintenta los demás.
export const JOB_WEBHOOK_FANOUT = 'webhook.fanout';
export const JOB_WEBHOOK_DELIVER = 'webhook.deliver';
export const JOB_NOTIFICATION_SEND = 'notification.send';

export interface WebhookFanoutJob {
  tenantId: string;
  event: string;
  payload: Record<string, unknown>;
}

export interface WebhookDeliverJob {
  tenantId: string;
  deliveryId: string;
}

export interface NotificationSendJob {
  tenantId: string;
  notificationId: string;
}

// Un intento inmediato más 4 reintentos con espera exponencial (1s, 2s, 4s, 8s).
export const DEFAULT_ATTEMPTS = 5;
