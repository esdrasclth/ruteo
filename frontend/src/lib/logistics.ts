import type {
  CarrierType,
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
  StopStatus,
  StopType,
  SubscriptionStatus,
  UserStatus,
  VehicleType,
} from "./api";

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  OPERATOR: "Operador",
  DRIVER: "Driver",
  MERCHANT: "Comercio",
  SUPPORT: "Soporte",
  CUSTOMER: "Cliente",
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
