import { DeliveryFailureReason } from '@prisma/client';

/**
 * Cómo se lee cada motivo de fallo en español.
 *
 * Vive aquí y no en el panel porque tiene un segundo consumidor: el texto libre
 * de `ProofOfDelivery.failureReason`, que se sigue rellenando para no romper a
 * quien lee el POD. Con la etiqueta sólo en el frontend, ese texto habría
 * acabado siendo el nombre del enum en inglés y mayúsculas —`NO_RECIPIENT`—
 * dentro de una pantalla en español.
 *
 * `satisfies Record<...>` y no un objeto suelto: añadir un motivo al enum sin
 * darle etiqueta deja de compilar aquí, en vez de aparecer meses después como
 * un hueco en blanco en la lista del repartidor.
 */
export const MOTIVOS_DE_FALLO = {
  NO_RECIPIENT: 'No había quien recibiera',
  WRONG_ADDRESS: 'La dirección no corresponde',
  PHONE_UNREACHABLE: 'El teléfono no contesta',
  CUSTOMER_REFUSED: 'El destinatario rechazó el paquete',
  BUSINESS_CLOSED: 'Local cerrado',
  RESCHEDULED: 'El cliente pidió otro día',
  OTHER: 'Otro motivo',
} satisfies Record<DeliveryFailureReason, string>;

/**
 * El texto que se guarda en el POD y se muestra en el historial.
 *
 * La nota se pega detrás de la etiqueta en vez de sustituirla: quien lee quiere
 * saber a la vez de qué categoría es —que es lo que se cuenta— y qué pasó en
 * concreto, y perder cualquiera de las dos obliga a abrir otra pantalla.
 */
export function describirFallo(
  motivo: DeliveryFailureReason,
  nota?: string | null,
): string {
  const etiqueta = MOTIVOS_DE_FALLO[motivo];
  return nota ? `${etiqueta}: ${nota}` : etiqueta;
}
