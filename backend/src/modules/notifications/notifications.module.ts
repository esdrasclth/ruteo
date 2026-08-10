import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { QUEUE_NOTIFICATIONS } from '../../queue/queue.constants';
import { LogNotificationProvider } from './log-notification.provider';
import { NOTIFICATION_PROVIDER } from './notification-provider';
import { ResendNotificationProvider } from './resend-notification.provider';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS })],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    LogNotificationProvider,
    // Techo del envío manual: el filtro de destinatario acota a QUIÉN se puede
    // escribir, y este a cuánto.
    RateLimitGuard,
    // Con clave de Resend se entrega de verdad; sin ella se sigue registrando
    // en el log, que es lo que permite probar el flujo completo en local sin
    // mandar correo a nadie. La elección se hace al arrancar y queda visible en
    // el nombre del proveedor que se guarda en cada notificación.
    {
      provide: NOTIFICATION_PROVIDER,
      inject: [ConfigService, LogNotificationProvider],
      useFactory: (config: ConfigService, log: LogNotificationProvider) =>
        config.get<string>('RESEND_API_KEY')
          ? new ResendNotificationProvider(config)
          : log,
    },
  ],
  // El proveedor se exporta para que `CredentialsService` mande los códigos por
  // el mismo canal y con el mismo registro que el resto de avisos.
  exports: [NotificationsService, NOTIFICATION_PROVIDER],
})
export class NotificationsModule {}
