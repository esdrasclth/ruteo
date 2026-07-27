import { ShipmentStatus } from '@prisma/client';

const MESSAGES: Partial<Record<ShipmentStatus, string>> = {
  [ShipmentStatus.LABEL_GENERATED]: 'tu etiqueta fue generada',
  [ShipmentStatus.PICKED_UP]: 'fue recogido',
  [ShipmentStatus.IN_TRANSIT]: 'va en tránsito',
  [ShipmentStatus.RECEIVED_USA]: 'llegó a nuestra bodega en USA',
  [ShipmentStatus.CONSOLIDATED]: 'fue consolidado para su envío',
  [ShipmentStatus.IN_TRANSIT_INTL]: 'va en tránsito internacional',
  [ShipmentStatus.IN_CUSTOMS_HN]: 'está en aduana de Honduras',
  [ShipmentStatus.CUSTOMS_CLEARED]: 'fue liberado de aduana',
  [ShipmentStatus.IN_WAREHOUSE_HN]: 'llegó a nuestra bodega en Honduras',
  [ShipmentStatus.OUT_FOR_DELIVERY]: 'salió a reparto',
  [ShipmentStatus.DELIVERED]: 'fue entregado',
  [ShipmentStatus.FAILED_ATTEMPT]: 'tuvo un intento de entrega fallido',
  [ShipmentStatus.RETURNED]: 'fue devuelto',
  [ShipmentStatus.CANCELLED]: 'fue cancelado',
  [ShipmentStatus.ON_HOLD_CUSTOMS]: 'está retenido en aduana',
};

export function statusMessage(
  trackingNumber: string,
  status: ShipmentStatus,
): string {
  const phrase = MESSAGES[status] ?? `cambió a estado ${status}`;
  return `Tu envío ${trackingNumber} ${phrase}.`;
}
