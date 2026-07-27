import { ShipmentStatus, ShipmentType } from '@prisma/client';

const S = ShipmentStatus;

// Allowed status transitions per shipment type. A status missing from the map
// (or mapping to an empty list) is terminal.
const LOCAL_TRANSITIONS: Partial<Record<ShipmentStatus, ShipmentStatus[]>> = {
  [S.CREATED]: [S.LABEL_GENERATED, S.CANCELLED],
  [S.LABEL_GENERATED]: [S.PICKED_UP, S.CANCELLED],
  [S.PICKED_UP]: [S.IN_TRANSIT, S.FAILED_ATTEMPT, S.RETURNED, S.CANCELLED],
  [S.IN_TRANSIT]: [S.OUT_FOR_DELIVERY, S.FAILED_ATTEMPT, S.RETURNED],
  [S.OUT_FOR_DELIVERY]: [S.DELIVERED, S.FAILED_ATTEMPT, S.RETURNED],
  [S.FAILED_ATTEMPT]: [S.OUT_FOR_DELIVERY, S.RETURNED, S.CANCELLED],
};

const INTERNATIONAL_TRANSITIONS: Partial<
  Record<ShipmentStatus, ShipmentStatus[]>
> = {
  [S.CREATED]: [S.RECEIVED_USA, S.CANCELLED],
  [S.RECEIVED_USA]: [S.CONSOLIDATED, S.CANCELLED],
  [S.CONSOLIDATED]: [S.IN_TRANSIT_INTL, S.CANCELLED],
  [S.IN_TRANSIT_INTL]: [S.IN_CUSTOMS_HN],
  [S.IN_CUSTOMS_HN]: [S.CUSTOMS_CLEARED, S.ON_HOLD_CUSTOMS, S.RETURNED],
  [S.ON_HOLD_CUSTOMS]: [S.CUSTOMS_CLEARED, S.RETURNED],
  [S.CUSTOMS_CLEARED]: [S.IN_WAREHOUSE_HN],
  [S.IN_WAREHOUSE_HN]: [S.OUT_FOR_DELIVERY],
  [S.OUT_FOR_DELIVERY]: [S.DELIVERED, S.FAILED_ATTEMPT, S.RETURNED],
  [S.FAILED_ATTEMPT]: [S.OUT_FOR_DELIVERY, S.RETURNED],
};

const TRANSITIONS: Record<
  ShipmentType,
  Partial<Record<ShipmentStatus, ShipmentStatus[]>>
> = {
  [ShipmentType.LOCAL]: LOCAL_TRANSITIONS,
  [ShipmentType.INTERNATIONAL]: INTERNATIONAL_TRANSITIONS,
};

export function canTransition(
  type: ShipmentType,
  from: ShipmentStatus,
  to: ShipmentStatus,
): boolean {
  return TRANSITIONS[type][from]?.includes(to) ?? false;
}

export function allowedNextStatuses(
  type: ShipmentType,
  from: ShipmentStatus,
): ShipmentStatus[] {
  return TRANSITIONS[type][from] ?? [];
}
