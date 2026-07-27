import type { ShipmentStatus, ShipmentType } from "./api";

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  CREATED: "Creado",
  LABEL_GENERATED: "Etiqueta generada",
  PICKED_UP: "Recolectado",
  IN_TRANSIT: "En tránsito",
  OUT_FOR_DELIVERY: "En reparto",
  DELIVERED: "Entregado",
  FAILED_ATTEMPT: "Intento fallido",
  RETURNED: "Devuelto",
  CANCELLED: "Cancelado",
  RECEIVED_USA: "Recibido en USA",
  CONSOLIDATED: "Consolidado",
  IN_TRANSIT_INTL: "Tránsito internacional",
  IN_CUSTOMS_HN: "En aduana HN",
  ON_HOLD_CUSTOMS: "Retenido en aduana",
  CUSTOMS_CLEARED: "Liberado de aduana",
  IN_WAREHOUSE_HN: "En bodega HN",
};

export const TYPE_LABELS: Record<ShipmentType, string> = {
  LOCAL: "Local",
  INTERNATIONAL: "Internacional",
};

// Espejo de backend/src/modules/shipments/shipment-status.ts
const LOCAL_TRANSITIONS: Partial<Record<ShipmentStatus, ShipmentStatus[]>> = {
  CREATED: ["LABEL_GENERATED", "CANCELLED"],
  LABEL_GENERATED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT", "FAILED_ATTEMPT", "RETURNED", "CANCELLED"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "FAILED_ATTEMPT", "RETURNED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED_ATTEMPT", "RETURNED"],
  FAILED_ATTEMPT: ["OUT_FOR_DELIVERY", "RETURNED", "CANCELLED"],
};

const INTERNATIONAL_TRANSITIONS: Partial<
  Record<ShipmentStatus, ShipmentStatus[]>
> = {
  CREATED: ["RECEIVED_USA", "CANCELLED"],
  RECEIVED_USA: ["CONSOLIDATED", "CANCELLED"],
  CONSOLIDATED: ["IN_TRANSIT_INTL", "CANCELLED"],
  IN_TRANSIT_INTL: ["IN_CUSTOMS_HN"],
  IN_CUSTOMS_HN: ["CUSTOMS_CLEARED", "ON_HOLD_CUSTOMS", "RETURNED"],
  ON_HOLD_CUSTOMS: ["CUSTOMS_CLEARED", "RETURNED"],
  CUSTOMS_CLEARED: ["IN_WAREHOUSE_HN"],
  IN_WAREHOUSE_HN: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED_ATTEMPT", "RETURNED"],
  FAILED_ATTEMPT: ["OUT_FOR_DELIVERY", "RETURNED"],
};

export function allowedNextStatuses(
  type: ShipmentType,
  from: ShipmentStatus,
): ShipmentStatus[] {
  const map = type === "LOCAL" ? LOCAL_TRANSITIONS : INTERNATIONAL_TRANSITIONS;
  return map[from] ?? [];
}

export function statusBadgeClass(status: ShipmentStatus): string {
  switch (status) {
    case "DELIVERED":
      return "bg-primary text-primary-foreground";
    case "CANCELLED":
    case "RETURNED":
    case "FAILED_ATTEMPT":
    case "ON_HOLD_CUSTOMS":
      return "bg-destructive/10 text-destructive border border-destructive/30";
    case "CREATED":
    case "LABEL_GENERATED":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-accent text-accent-foreground";
  }
}
