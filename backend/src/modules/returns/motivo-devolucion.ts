import { ReturnDestination, ReturnReason } from '@prisma/client';

const MOTIVOS: Record<ReturnReason, string> = {
  [ReturnReason.UNDELIVERABLE]: 'no se pudo entregar',
  [ReturnReason.REFUSED]: 'el destinatario no lo recibió',
  [ReturnReason.UNCLAIMED]: 'nadie lo retiró',
  [ReturnReason.UNPAID]: 'no se pagaron los cargos',
  [ReturnReason.CUSTOMS_REJECTED]: 'aduana lo rechazó',
  [ReturnReason.DAMAGED]: 'llegó dañado',
  [ReturnReason.OTHER]: 'otro motivo',
};

const DESTINOS: Record<ReturnDestination, string> = {
  [ReturnDestination.BRANCH]: 'vuelve a sucursal',
  [ReturnDestination.SENDER]: 'vuelve al remitente',
  [ReturnDestination.VENDOR]: 'vuelve al vendedor',
  [ReturnDestination.ABANDONED]: 'queda como abandonado',
};

/**
 * La frase que ve el cliente en su rastreo.
 *
 * Lleva el motivo y no sólo el destino porque «devuelto» a secas es la línea
 * que genera la llamada: quien ve que su paquete volvió quiere saber por qué
 * antes de decidir si reclama.
 */
export function describirDevolucion(
  destino: ReturnDestination,
  motivo: ReturnReason,
): string {
  return `Devolución: ${DESTINOS[destino]} porque ${MOTIVOS[motivo]}.`;
}
