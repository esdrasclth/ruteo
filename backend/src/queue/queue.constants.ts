export const QUEUE_WEBHOOKS = 'webhooks';
export const QUEUE_NOTIFICATIONS = 'notifications';

// Tareas de casa: no las dispara ninguna petición, se repiten solas. Van en su
// propia cola para que un mantenimiento lento no se ponga por delante de una
// entrega a un cliente.
//
// **UNA cola, UN `@Processor`.** En BullMQ cada `@Processor` sobre un mismo
// nombre de cola levanta su propio `Worker`, y todos compiten por TODOS los
// trabajos de esa cola sin mirar el nombre del job. Dos procesadores aquí
// significan que el de idempotencia puede quedarse un job de facturación,
// no reconocerlo, devolver `undefined` y dejarlo por COMPLETADO sin haber hecho
// nada. Ese fallo es silencioso: el trabajo desaparece y nadie reclama.
//
// Por eso cada mantenimiento nuevo estrena su propia cola en vez de sumarse a
// esta. Son baratas.
export const QUEUE_MANTENIMIENTO = 'mantenimiento';

// Mantenimiento de facturación: hoy, caducar las pruebas que abre el registro.
export const QUEUE_FACTURACION = 'facturacion';

// Un webhook se despacha en dos etapas: `fanout` resuelve qué endpoints del
// tenant escuchan el evento y encola un `deliver` por cada uno, de modo que un
// endpoint lento o caído no bloquea ni reintenta los demás.
export const JOB_WEBHOOK_FANOUT = 'webhook.fanout';
export const JOB_WEBHOOK_DELIVER = 'webhook.deliver';
export const JOB_NOTIFICATION_SEND = 'notification.send';
export const JOB_PURGAR_IDEMPOTENCIA = 'idempotencia.purgar';
export const JOB_CADUCAR_PRUEBAS = 'facturacion.caducar-pruebas';
export const JOB_AVISAR_PRUEBAS = 'facturacion.avisar-pruebas';

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
