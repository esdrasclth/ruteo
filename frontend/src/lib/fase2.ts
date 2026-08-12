import type {
  ExceptionSeverity,
  ExceptionStatus,
  ExceptionType,
  ManifestStatus,
  TripStatus,
} from "@/lib/api";

/**
 * Etiquetas y colores de manifiestos y excepciones.
 *
 * Viven aquí y no dentro de cada pantalla porque el mismo estado se pinta en la
 * lista, en el detalle y en el tablero: con la traducción repetida, añadir un
 * valor al enum deja dos sitios diciendo el nombre técnico y uno el bonito.
 */

export const MANIFEST_STATUS_LABELS: Record<ManifestStatus, string> = {
  DRAFT: "Borrador",
  TRANSMITTED: "Transmitido",
  ARRIVED: "Arribado",
  RECONCILED: "Cotejado",
};

export function manifestStatusBadgeClass(estado: ManifestStatus): string {
  switch (estado) {
    case "DRAFT":
      return "bg-muted text-muted-foreground";
    case "TRANSMITTED":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
    case "ARRIVED":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    case "RECONCILED":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  }
}

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  PLANNED: "Planificado",
  IN_TRANSIT: "En tránsito",
  ARRIVED: "Arribado",
  CANCELLED: "Cancelado",
};

export const EXCEPTION_TYPE_LABELS: Record<ExceptionType, string> = {
  MANIFEST_MISMATCH: "Manifiesto no cuadra",
  MISSING: "Faltante",
  OVERAGE: "Sobrante",
  DAMAGED: "Dañado",
  OVERWEIGHT: "Diferencia de peso",
  CUSTOMS_HOLD: "Retenido en aduana",
  DOCUMENTATION_REQUIRED: "Falta documentación",
  ADDRESS_PROBLEM: "Problema de dirección",
  OTHER: "Otro",
};

export const EXCEPTION_STATUS_LABELS: Record<ExceptionStatus, string> = {
  OPEN: "Abierta",
  INVESTIGATING: "En revisión",
  RESOLVED: "Resuelta",
  // Se dice "asumida" y no "cerrada": lo que la distingue de RESOLVED es que
  // costó dinero, y esa diferencia se pierde con una etiqueta neutra.
  WRITTEN_OFF: "Asumida",
};

export const EXCEPTION_SEVERITY_LABELS: Record<ExceptionSeverity, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
};

export function severityBadgeClass(sev: ExceptionSeverity): string {
  switch (sev) {
    case "HIGH":
      return "bg-red-500/15 text-red-700 dark:text-red-300";
    case "MEDIUM":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    case "LOW":
      return "bg-muted text-muted-foreground";
  }
}

export function exceptionStatusBadgeClass(estado: ExceptionStatus): string {
  switch (estado) {
    case "OPEN":
      return "bg-red-500/15 text-red-700 dark:text-red-300";
    case "INVESTIGATING":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
    case "RESOLVED":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "WRITTEN_OFF":
      return "bg-muted text-muted-foreground";
  }
}

/** Estados que cuentan como «todavía hay que hacer algo». */
export const EXCEPCIONES_ABIERTAS: ExceptionStatus[] = [
  "OPEN",
  "INVESTIGATING",
];
