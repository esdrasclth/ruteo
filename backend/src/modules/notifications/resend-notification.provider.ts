import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@prisma/client';
import {
  NotificationMessage,
  NotificationProvider,
  NotificationSendResult,
} from './notification-provider';

// Entrega de correo por la API HTTP de Resend.
//
// Se usa la API y no SMTP para no arrastrar una dependencia de transporte
// (nodemailer) por un solo POST. La instancia de ZITADEL ya envía por Resend,
// así que la cuenta existe; aquí hace falta su clave de API para que Ruteo
// mande sus propios correos —los códigos de restablecimiento los custodia
// Ruteo, ver `CredentialToken`—.
//
// Solo cubre EMAIL. SMS, push y WhatsApp siguen sin proveedor real: para esos
// canales delega en el de registro para no fingir una entrega que no ocurre.
@Injectable()
export class ResendNotificationProvider implements NotificationProvider {
  readonly name = 'resend';
  private readonly log = new Logger('Notification');

  constructor(private readonly config: ConfigService) {}

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    if (message.channel !== NotificationChannel.EMAIL) {
      this.log.log(
        `[${message.channel}] sin proveedor real -> ${message.recipient}: ${message.body}`,
      );
      return { ok: true };
    }

    const apiKey = this.config.get<string>('RESEND_API_KEY') ?? '';
    const from = this.config.get<string>('MAIL_FROM') ?? '';
    if (!apiKey || !from) {
      // Configuración incompleta. Se marca como fallo en vez de "enviado": un
      // correo que nadie recibe pero figura como entregado es peor que un error
      // visible, sobre todo cuando lo que viaja es un código de acceso.
      return { ok: false, error: 'RESEND_API_KEY o MAIL_FROM sin configurar' };
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [message.recipient],
          subject: message.title ?? 'Ruteo',
          text: message.body,
        }),
      });

      if (!res.ok) {
        const detalle = await res.text().catch(() => '');
        return {
          ok: false,
          error: `resend ${res.status}: ${detalle.slice(0, 200)}`,
        };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `resend inalcanzable: ${String(e)}` };
    }
  }
}
