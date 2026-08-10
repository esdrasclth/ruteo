import { NotificationChannel, Prisma } from '@prisma/client';

/**
 * ¿El destinatario de una notificación pertenece a esta empresa?
 *
 * **Por qué existe.** `POST /api/notifications` aceptaba cualquier `recipient`
 * en texto libre y lo entregaba por Resend, que firma con el SPF/DKIM de
 * `MAIL_FROM`. El módulo `NOTIFICATIONS` viene en el plan FREE, así que la
 * secuencia completa era: registrarse, y usar el dominio de Ruteo como relay de
 * correo para escribirle a cualquiera. Lo caro no es la cuota de Resend: es que
 * una campaña de phishing firmada por tu dominio te tira la reputación, y con
 * ella los códigos de verificación de todos los clientes reales.
 *
 * El arreglo es acotar el destinatario a alguien con quien la empresa ya tiene
 * relación en su propia base. Todo lo de aquí corre dentro de `withTenant`, así
 * que RLS ya limita la búsqueda a las filas de esa empresa: no hace falta —ni se
 * debe— filtrar por `tenant_id` a mano.
 *
 * Esto NO afecta a los avisos que dispara el propio sistema
 * (`NotificationsService.dispatch`): el teléfono de un cambio de estado sale del
 * envío, no de una petición. El filtro se aplica donde entra texto de fuera.
 */

/**
 * Dígitos mínimos para comparar dos teléfonos.
 *
 * Los números se guardan como los teclee cada quien: `+504 9999-8888`,
 * `99998888`, `504-99998888`. Comparar en crudo daría negativo en casos que son
 * la misma persona, así que se comparan solo los dígitos y basta con que uno sea
 * sufijo del otro (el prefijo de país es justo lo que sobra o falta).
 *
 * Ocho es el largo de un número local en Honduras. Por debajo de eso, un sufijo
 * corto coincidiría con demasiada gente y el filtro dejaría de filtrar.
 */
const MIN_DIGITOS = 8;

export type ResultadoDestinatario =
  { permitido: true } | { permitido: false; motivo: string };

const PERMITIDO: ResultadoDestinatario = { permitido: true };

export function digitosDe(telefono: string): string {
  return telefono.replace(/[^0-9]/g, '');
}

export async function comprobarDestinatario(
  tx: Prisma.TransactionClient,
  channel: NotificationChannel,
  recipient: string,
): Promise<ResultadoDestinatario> {
  switch (channel) {
    case NotificationChannel.EMAIL:
      return comprobarCorreo(tx, recipient);
    case NotificationChannel.SMS:
    case NotificationChannel.WHATSAPP:
      return comprobarTelefono(tx, recipient);
    case NotificationChannel.PUSH:
      // No hay registro de dispositivos en el esquema, así que no existe nada
      // contra lo que validar un token de push. Antes que dejar un canal sin
      // filtro —que sería el mismo agujero el día que se enchufe un proveedor
      // de verdad—, se rechaza y se dice por qué. Hoy PUSH solo escribe en el
      // log, así que no se pierde ninguna entrega real.
      return {
        permitido: false,
        motivo:
          'El canal PUSH todavía no tiene proveedor ni registro de dispositivos.',
      };
  }
}

async function comprobarCorreo(
  tx: Prisma.TransactionClient,
  recipient: string,
): Promise<ResultadoDestinatario> {
  const correo = recipient.trim().toLowerCase();

  // `insensitive` en los dos: el correo de `users` se guarda en minúsculas al
  // darlo de alta, pero el de `customers` entra tal cual lo escriba el operador.
  const [usuario, cliente] = await Promise.all([
    tx.user.findFirst({
      where: { email: { equals: correo, mode: 'insensitive' } },
      select: { id: true },
    }),
    tx.customer.findFirst({
      where: { email: { equals: correo, mode: 'insensitive' } },
      select: { id: true },
    }),
  ]);

  if (usuario || cliente) return PERMITIDO;
  return {
    permitido: false,
    motivo:
      'Solo se puede escribir a un correo que ya esté en tu equipo o en tu lista de clientes.',
  };
}

async function comprobarTelefono(
  tx: Prisma.TransactionClient,
  recipient: string,
): Promise<ResultadoDestinatario> {
  const digitos = digitosDe(recipient);
  if (digitos.length < MIN_DIGITOS) {
    return {
      permitido: false,
      motivo: `El teléfono debe traer al menos ${MIN_DIGITOS} dígitos.`,
    };
  }

  // Se normaliza en SQL con `[^0-9]` en vez de `\D` a propósito: dentro de una
  // plantilla de JavaScript, `\D` pierde la barra y el patrón acabaría siendo
  // una "D" literal —el filtro seguiría compilando y dejaría pasar todo—.
  //
  // Recorre las tres tablas sin índice que ayude, pero es un envío manual que
  // además está limitado por cupo; no es un camino caliente.
  const filas = await tx.$queryRaw<{ ok: number }[]>`
    WITH candidatos AS (
      SELECT regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') AS d
        FROM customers
      UNION ALL
      SELECT regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
        FROM drivers
      UNION ALL
      SELECT regexp_replace(coalesce(recipient_phone, ''), '[^0-9]', '', 'g')
        FROM shipments
    )
    SELECT 1 AS ok
      FROM candidatos
     WHERE length(d) >= ${MIN_DIGITOS}
       AND (d LIKE '%' || ${digitos} OR ${digitos} LIKE '%' || d)
     LIMIT 1`;

  if (filas.length > 0) return PERMITIDO;
  return {
    permitido: false,
    motivo:
      'Solo se puede escribir a un teléfono que ya esté en tus clientes, repartidores o envíos.',
  };
}
