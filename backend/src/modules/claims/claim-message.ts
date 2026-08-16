import { ClaimStatus } from '@prisma/client';

/**
 * Lo que se le dice al cliente en cada paso de su reclamo.
 *
 * Los mensajes dicen **qué pasa ahora y qué se espera de él**, no sólo el
 * estado. Un «tu reclamo cambió a APPROVED» obliga a llamar para preguntar qué
 * significa, que es exactamente la llamada que la notificación viene a evitar.
 *
 * El importe va dentro cuando lo hay: es el dato por el que preguntaría.
 */
export function mensajeDeReclamo(
  numero: string,
  trackingNumber: string,
  status: ClaimStatus,
  opciones: { importe?: string | null; moneda?: string } = {},
): string {
  const dinero =
    opciones.importe != null
      ? ` por ${opciones.moneda ?? 'USD'} ${opciones.importe}`
      : '';

  switch (status) {
    case ClaimStatus.OPEN:
      return `Recibimos tu reclamo ${numero} sobre el envío ${trackingNumber}. Te avisaremos en cuanto lo revisemos.`;
    case ClaimStatus.INVESTIGATING:
      return `Tu reclamo ${numero} está en revisión. Si necesitamos algo más te lo pediremos por este medio.`;
    case ClaimStatus.APPROVED:
      return `Tu reclamo ${numero} fue aprobado${dinero}. Estamos gestionando la devolución del dinero.`;
    case ClaimStatus.REJECTED:
      // No se le manda el texto interno de la resolución: puede llevar detalle
      // de la operación —quién revisó qué— que no es asunto del cliente. Se le
      // dice que hay un motivo y por dónde pedirlo.
      return `Tu reclamo ${numero} no procedió. Escríbenos si quieres conocer el detalle.`;
    case ClaimStatus.SETTLED:
      return `Listo: te devolvimos${dinero} por tu reclamo ${numero}.`;
  }
}
