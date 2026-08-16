import type {
  ApiScope,
  CarrierType,
  ClaimStatus,
  ClaimType,
  RefundStatus,
  ReturnDestination,
  ReturnReason,
  ReturnStatus,
  ChargeConcept,
  ChargeKind,
  ChargeStatus,
  CustomsStatus,
  DriverStatus,
  LockerStatus,
  NotificationChannel,
  NotificationStatus,
  PackageStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  Role,
  RouteStatus,
  ShipmentEventType,
  StopStatus,
  StopType,
  SubscriptionStatus,
  UserStatus,
  VehicleType,
} from "./api";

/**
 * Alcances de una llave de API, en el orden en que se ofrecen al crearla.
 *
 * La descripción no es decorativa: quien crea la llave está decidiendo qué
 * podrá hacer un sistema ajeno con los datos de su empresa, y «LOCKERS_WRITE»
 * no dice si eso incluye recibir bultos en bodega —no lo incluye—.
 */
export const API_SCOPES: {
  value: ApiScope;
  label: string;
  description: string;
}[] = [
  {
    value: "LOCKERS_WRITE",
    label: "Casilleros: escribir",
    description: "Crear casilleros y registrar prealertas de compras.",
  },
  {
    value: "LOCKERS_READ",
    label: "Casilleros: leer",
    description: "Consultar casilleros y los bultos de cada uno.",
  },
  {
    value: "SHIPMENTS_WRITE",
    label: "Envíos: escribir",
    description: "Crear envíos, uno a uno o importando un CSV.",
  },
  {
    value: "SHIPMENTS_READ",
    label: "Envíos: leer",
    description: "Consultar envíos y descargar sus etiquetas.",
  },
];

export const API_SCOPE_LABELS: Record<ApiScope, string> = {
  LOCKERS_WRITE: "Casilleros: escribir",
  LOCKERS_READ: "Casilleros: leer",
  SHIPMENTS_WRITE: "Envíos: escribir",
  SHIPMENTS_READ: "Envíos: leer",
};

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  OPERATOR: "Operador",
  DRIVER: "Driver",
  MERCHANT: "Comercio",
  SUPPORT: "Soporte",
  CUSTOMER: "Cliente",
};

/**
 * Primera pantalla útil para cada rol, después de entrar.
 *
 * El login mandaba a todo el mundo a `/dashboard`, que consulta `/analytics/*`
 * y está reservado a los perfiles de oficina: un repartidor o un comercio
 * aterrizaban en un tablero que les responde 403 en cada llamada.
 *
 * `CUSTOMER` no tiene ninguna pantalla del panel —todavía no existe un portal
 * de cliente—, así que se le manda al rastreo público, que es lo único de este
 * producto pensado para él.
 */
export const INICIO_POR_ROL: Record<Role, string> = {
  OWNER: "/dashboard",
  ADMIN: "/dashboard",
  OPERATOR: "/dashboard",
  DRIVER: "/routes",
  MERCHANT: "/shipments",
  SUPPORT: "/shipments",
  CUSTOMER: "/track",
};

// Roles that can be assigned to a team member from the UI.
export const ASSIGNABLE_ROLES: Role[] = [
  "ADMIN",
  "OPERATOR",
  "SUPPORT",
  "DRIVER",
  "MERCHANT",
  "CUSTOMER",
];

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: "Activo",
  DISABLED: "Deshabilitado",
};

export function userStatusBadgeClass(status: UserStatus): string {
  return status === "ACTIVE"
    ? "bg-primary text-primary-foreground"
    : "bg-muted text-muted-foreground";
}

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  MOTORCYCLE: "Motocicleta",
  CAR: "Carro",
  VAN: "Van",
  TRUCK: "Camión",
  BICYCLE: "Bicicleta",
};

export const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  AVAILABLE: "Disponible",
  BUSY: "Ocupado",
  OFFLINE: "Fuera de línea",
};

export function driverStatusBadgeClass(status: DriverStatus): string {
  switch (status) {
    case "AVAILABLE":
      return "bg-primary text-primary-foreground";
    case "BUSY":
      return "bg-accent text-accent-foreground";
    case "OFFLINE":
      return "bg-muted text-muted-foreground";
  }
}

export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  PLANNED: "Planificada",
  IN_PROGRESS: "En curso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

export const ROUTE_NEXT_STATUSES: Record<RouteStatus, RouteStatus[]> = {
  PLANNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function routeStatusBadgeClass(status: RouteStatus): string {
  switch (status) {
    case "COMPLETED":
      return "bg-primary text-primary-foreground";
    case "IN_PROGRESS":
      return "bg-accent text-accent-foreground";
    case "CANCELLED":
      return "bg-destructive/10 text-destructive border border-destructive/30";
    case "PLANNED":
      return "bg-muted text-muted-foreground";
  }
}

export const STOP_STATUS_LABELS: Record<StopStatus, string> = {
  PENDING: "Pendiente",
  ARRIVED: "En sitio",
  COMPLETED: "Completada",
  FAILED: "Fallida",
};

export function stopStatusBadgeClass(status: StopStatus): string {
  switch (status) {
    case "COMPLETED":
      return "bg-primary text-primary-foreground";
    case "ARRIVED":
      return "bg-accent text-accent-foreground";
    case "FAILED":
      return "bg-destructive/10 text-destructive border border-destructive/30";
    case "PENDING":
      return "bg-muted text-muted-foreground";
  }
}

export const STOP_TYPE_LABELS: Record<StopType, string> = {
  PICKUP: "Recolección",
  DELIVERY: "Entrega",
};

export const PACKAGE_STATUS_LABELS: Record<PackageStatus, string> = {
  PRE_ALERTED: "Pre-alertado",
  RECEIVED: "Recibido",
  CONSOLIDATED: "Consolidado",
  SHIPPED: "Enviado",
};

export function packageStatusBadgeClass(status: PackageStatus): string {
  switch (status) {
    case "RECEIVED":
      return "bg-accent text-accent-foreground";
    case "CONSOLIDATED":
    case "SHIPPED":
      return "bg-primary text-primary-foreground";
    case "PRE_ALERTED":
      return "bg-muted text-muted-foreground";
  }
}

export const LOCKER_STATUS_LABELS: Record<LockerStatus, string> = {
  ACTIVE: "Activo",
  SUSPENDED: "Suspendido",
};

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  COD: "COD",
  SUBSCRIPTION: "Suscripción",
  CHARGES: "Cargos del envío",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pendiente",
  COLLECTED: "Cobrado",
  REMITTED: "Remitido",
  CANCELLED: "Cancelado",
};

export function paymentStatusBadgeClass(status: PaymentStatus): string {
  switch (status) {
    case "REMITTED":
      return "bg-primary text-primary-foreground";
    case "COLLECTED":
      return "bg-accent text-accent-foreground";
    case "CANCELLED":
      return "bg-destructive/10 text-destructive border border-destructive/30";
    case "PENDING":
      return "bg-muted text-muted-foreground";
  }
}

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIALING: "En prueba",
  ACTIVE: "Activa",
  PAST_DUE: "En mora",
  CANCELED: "Cancelada",
};

export function subscriptionStatusBadgeClass(
  status: SubscriptionStatus,
): string {
  switch (status) {
    case "ACTIVE":
      return "bg-primary text-primary-foreground";
    case "TRIALING":
      return "bg-accent text-accent-foreground";
    case "PAST_DUE":
    case "CANCELED":
      return "bg-destructive/10 text-destructive border border-destructive/30";
  }
}

// Modo de transporte de un tramo (LegMode del backend). Sin esto la vista
// pública mostraba el enum crudo — "AIR", "SEA" — al cliente final.
export const LEG_MODE_LABELS: Record<string, string> = {
  AIR: "Aéreo",
  SEA: "Marítimo",
  GROUND: "Terrestre",
};

export function legModeLabel(mode: string): string {
  return LEG_MODE_LABELS[mode] ?? mode;
}

export const CARRIER_TYPE_LABELS: Record<CarrierType, string> = {
  COURIER: "Courier",
  AIRLINE: "Aerolínea",
  OCEAN: "Naviera",
  GROUND: "Terrestre",
};

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> =
  {
    SMS: "SMS",
    EMAIL: "Correo",
    PUSH: "Push",
    WHATSAPP: "WhatsApp",
  };

export const NOTIFICATION_STATUS_LABELS: Record<NotificationStatus, string> = {
  PENDING: "Pendiente",
  SENT: "Enviada",
  FAILED: "Fallida",
};

export function notificationStatusBadgeClass(status: NotificationStatus) {
  switch (status) {
    case "SENT":
      return "bg-primary text-primary-foreground";
    case "FAILED":
      return "bg-destructive/10 text-destructive border border-destructive/30";
    case "PENDING":
      return "bg-muted text-muted-foreground";
  }
}

// Acciones que el backend registra hoy en `audit_logs`. Si aparece una nueva sin
// traducir, la UI muestra el identificador crudo en vez de romperse.
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "shipment.status_changed": "Cambio de estado de envío",
  "payment.collected": "Pago cobrado",
  "payment.remitted": "Pago remitido",
  "api_key.created": "API key creada",
  "api_key.revoked": "API key revocada",
  "subscription.changed": "Suscripción actualizada",
  "subscription.canceled": "Suscripción cancelada",
  "user.created": "Usuario creado",
  "user.updated": "Usuario actualizado",
  "user.password_reset": "Contraseña restablecida",
  "user.password_changed": "Contraseña cambiada",
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  shipment: "Envío",
  payment: "Pago",
  api_key: "API key",
  subscription: "Suscripción",
  user: "Usuario",
};

export const CUSTOMS_STATUS_LABELS: Record<CustomsStatus, string> = {
  PENDING: "Pendiente",
  IN_REVIEW: "En revisión",
  ON_HOLD: "Retenido",
  CLEARED: "Liberado",
  REJECTED: "Rechazado",
};

export function customsStatusBadgeClass(status: CustomsStatus): string {
  switch (status) {
    case "CLEARED":
      return "bg-primary text-primary-foreground";
    case "ON_HOLD":
    case "REJECTED":
      return "bg-destructive/10 text-destructive border border-destructive/30";
    case "IN_REVIEW":
      return "bg-accent text-accent-foreground";
    case "PENDING":
      return "bg-muted text-muted-foreground";
  }
}

export const EVENT_TYPE_LABELS: Record<ShipmentEventType, string> = {
  STATUS_CHANGED: "Cambio de estado",
  CUSTOMS_ASSESSED: "Liquidación de aduana",
  CUSTOMS_CLEARED: "Liberado de aduana",
  DOCUMENT_ADDED: "Documento adjuntado",
  DOCUMENT_VERIFIED: "Documento verificado",
  CHARGE_ADDED: "Cargo añadido",
  CHARGE_COLLECTED: "Pago recibido",
  EXCEPTION_OPENED: "Excepción abierta",
  EXCEPTION_RESOLVED: "Excepción cerrada",
  NOTE: "Nota",
};

/**
 * El punto de color de la línea de tiempo.
 *
 * Los cambios de estado llevan el color de la marca porque son la columna
 * vertebral del recorrido; el resto se distingue sin competir con ellos, y lo
 * que sale mal se ve a la primera.
 */
export function eventTypeDotClass(type: ShipmentEventType): string {
  switch (type) {
    case "STATUS_CHANGED":
      return "bg-primary";
    case "EXCEPTION_OPENED":
      return "bg-destructive";
    case "EXCEPTION_RESOLVED":
    case "CUSTOMS_CLEARED":
    case "CHARGE_COLLECTED":
      return "bg-emerald-500";
    default:
      return "bg-muted-foreground/40";
  }
}

export const CHARGE_CONCEPT_LABELS: Record<ChargeConcept, string> = {
  FREIGHT: "Flete",
  HANDLING: "Manejo",
  FUEL: "Combustible",
  INSURANCE: "Seguro",
  STORAGE: "Almacenaje",
  DELIVERY: "Entrega",
  REPACK: "Reempaque",
  DUTY: "Arancel",
  TAX: "ISV",
  PERMIT: "Permiso",
  OTHER: "Otro",
};

/**
 * La distinción que da sentido a toda la fase 4: lo que la empresa gana frente
 * a lo que solo cobra para entregárselo al Estado.
 */
export const CHARGE_KIND_LABELS: Record<ChargeKind, string> = {
  REVENUE: "Ingreso propio",
  PASS_THROUGH: "Tributo trasladado",
};

export const CHARGE_STATUS_LABELS: Record<ChargeStatus, string> = {
  PENDING: "Pendiente",
  PAID: "Cobrado",
  VOID: "Anulado",
};

export function chargeStatusBadgeClass(status: ChargeStatus): string {
  switch (status) {
    case "PAID":
      return "bg-primary text-primary-foreground";
    case "PENDING":
      return "bg-muted text-muted-foreground";
    // Tachado no: un anulado tiene que leerse como lo que es, no desaparecer.
    case "VOID":
      return "bg-destructive/10 text-destructive border border-destructive/30";
  }
}

// ---- Fase 6: posventa ----

export const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  DAMAGED: "Dañado",
  LOST: "Perdido",
  MISSING_ITEM: "Falta contenido",
  WRONG_CHARGE: "Cobro indebido",
  OTHER: "Otro",
};

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  OPEN: "Abierto",
  INVESTIGATING: "En revisión",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  SETTLED: "Liquidado",
};

/**
 * El color dice quién tiene la pelota, no si la noticia es buena.
 *
 * `APPROVED` va en ámbar y no en verde a propósito: aprobado significa que hay
 * dinero pendiente de salir, o sea trabajo sin terminar. El verde se reserva
 * para `SETTLED`, que es cuando de verdad se cerró.
 */
export const CLAIM_STATUS_CLASSES: Record<ClaimStatus, string> = {
  OPEN: "bg-destructive/10 text-destructive",
  INVESTIGATING: "bg-blue-500/10 text-blue-700",
  APPROVED: "bg-amber-500/10 text-amber-700",
  REJECTED: "bg-muted text-muted-foreground",
  SETTLED: "bg-primary/10 text-primary",
};

export const RETURN_DESTINATION_LABELS: Record<ReturnDestination, string> = {
  BRANCH: "A sucursal",
  SENDER: "Al remitente",
  VENDOR: "Al vendedor",
  ABANDONED: "Abandonado",
};

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  UNDELIVERABLE: "No se pudo entregar",
  REFUSED: "Rechazado por el destinatario",
  UNCLAIMED: "Nadie lo retiró",
  UNPAID: "Cargos sin pagar",
  CUSTOMS_REJECTED: "Rechazado en aduana",
  DAMAGED: "Dañado",
  OTHER: "Otro",
};

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  PENDING: "Pendiente",
  IN_TRANSIT: "En camino",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

export const RETURN_STATUS_CLASSES: Record<ReturnStatus, string> = {
  PENDING: "bg-amber-500/10 text-amber-700",
  IN_TRANSIT: "bg-blue-500/10 text-blue-700",
  COMPLETED: "bg-primary/10 text-primary",
  CANCELLED: "bg-muted text-muted-foreground",
};

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  PENDING: "Emitido",
  COMPLETED: "Pagado",
  FAILED: "Falló",
};

export const REFUND_STATUS_CLASSES: Record<RefundStatus, string> = {
  PENDING: "bg-amber-500/10 text-amber-700",
  COMPLETED: "bg-primary/10 text-primary",
  FAILED: "bg-destructive/10 text-destructive",
};
