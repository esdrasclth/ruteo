export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

export type Role =
  | "OWNER"
  | "ADMIN"
  | "OPERATOR"
  | "DRIVER"
  | "MERCHANT"
  | "SUPPORT"
  | "CUSTOMER";

export type UserStatus = "ACTIVE" | "DISABLED";

export interface Session {
  accessToken: string;
  refreshToken: string;
  slug: string;
  email: string;
  userId: string;
  name: string | null;
  role: Role;
}

/**
 * Una empresa a la que el correo y la contraseña recién tecleados dan acceso.
 * Es lo que devuelve `/auth/login` cuando la petición no lleva slug, o sea
 * desde el panel raíz.
 *
 * `url` apunta a OTRO origen —el subdominio de la empresa— y lleva dentro un
 * vale de un solo uso que caduca en un minuto. Se navega con `location.href`,
 * nunca con el router de Next, que solo sabe moverse dentro de este origen.
 */
export interface EmpresaDeAcceso {
  slug: string;
  nombre: string;
  url: string;
}

const SESSION_KEY = "ruteo.session";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setSession(session: Session) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(". ");
    if (body.message) return body.message;
  } catch {
    // ignore
  }
  return `Error ${res.status}`;
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const session = getSession();
      if (!session) return false;
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.refreshToken}` },
      });
      if (!res.ok) {
        clearSession();
        return false;
      }
      const tokens = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      setSession({ ...session, ...tokens });
      return true;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const doFetch = () => {
    const session = getSession();
    const headers: Record<string, string> = {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers as Record<string, string>),
    };
    if (session) headers.Authorization = `Bearer ${session.accessToken}`;
    return fetch(`${API_URL}${path}`, { ...init, headers });
  };

  let res = await doFetch();
  if (res.status === 401 && getSession()) {
    const refreshed = await tryRefresh();
    if (!refreshed) {
      if (typeof window !== "undefined") window.location.href = "/login";
      throw new ApiError(401, "Sesión expirada");
    }
    res = await doFetch();
  }

  if (!res.ok) throw new ApiError(res.status, await parseErrorMessage(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---- Tipos del backend ----

export type ShipmentType = "LOCAL" | "INTERNATIONAL";

export type ShipmentStatus =
  | "CREATED"
  | "LABEL_GENERATED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED_ATTEMPT"
  | "RETURNED"
  | "CANCELLED"
  | "RECEIVED_USA"
  | "CONSOLIDATED"
  | "IN_TRANSIT_INTL"
  | "IN_CUSTOMS_HN"
  | "ON_HOLD_CUSTOMS"
  | "CUSTOMS_CLEARED"
  | "IN_WAREHOUSE_HN";

export interface Shipment {
  id: string;
  trackingNumber: string;
  type: ShipmentType;
  status: ShipmentStatus;
  recipientName: string;
  recipientPhone: string | null;
  originLabel: string | null;
  originCountry: string | null;
  destinationLabel: string | null;
  destinationCountry: string | null;
  destinationLat: number | null;
  destinationLng: number | null;
  weightKg: string | null;
  declaredValue: string | null;
  codAmount: string | null;
  currency: string;
  carrierTrackingNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentEvent {
  id: string;
  status: ShipmentStatus;
  description: string | null;
  locationLabel: string | null;
  lat: number | null;
  lng: number | null;
  occurredAt: string;
}

// Espejo del modelo ShipmentLeg. El campo de estimación se llama `etaAt`, no
// `eta`: el tipo antiguo declaraba `eta` y el detalle del envío nunca llegó a
// mostrar la fecha porque leía una propiedad que la API no devuelve.
export interface ShipmentLeg {
  id: string;
  sequence: number;
  mode: LegMode;
  originLabel: string;
  destinationLabel: string;
  originLat: number | null;
  originLng: number | null;
  destinationLat: number | null;
  destinationLng: number | null;
  status: LegStatus;
  carrier: string | null;
  carrierId: string | null;
  externalTracking: string | null;
  etaAt: string | null;
  departedAt: string | null;
  arrivedAt: string | null;
}

export type LegMode = "AIR" | "SEA" | "GROUND";

// El detalle trae el contexto operativo del envío (cliente, ruta, cobros,
// avisos) para que la pantalla funcione como centro de la operación y no haya
// que ir saltando de módulo en módulo.
export interface ShipmentDetail extends Shipment {
  legs: ShipmentLeg[];
  events: ShipmentEvent[];
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
  customs: CustomsRecord | null;
  routeStops: {
    id: string;
    sequence: number;
    type: StopType;
    status: StopStatus;
    arrivedAt: string | null;
    completedAt: string | null;
    route: {
      id: string;
      code: string;
      status: RouteStatus;
      scheduledDate: string;
      driver: { id: string; name: string; phone: string | null } | null;
    };
    pod: ProofOfDelivery | null;
  }[];
  payments: Payment[];
  notifications: NotificationRow[];
  packages: {
    id: string;
    externalTracking: string | null;
    merchant: string | null;
    description: string | null;
    weightKg: string | null;
    status: PackageStatus;
    locker: { id: string; code: string } | null;
  }[];
}

export interface SearchHit {
  id: string;
  titulo: string;
  subtitulo: string | null;
  href: string;
}

export interface SearchResults {
  query: string;
  total: number;
  envios: SearchHit[];
  clientes: SearchHit[];
  casilleros: SearchHit[];
  rutas: SearchHit[];
  repartidores: SearchHit[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Overview {
  range: { from: string; to: string };
  shipments: {
    total: number;
    delivered: number;
    failed: number;
    returned: number;
    cancelled: number;
    deliveryRate: number;
  };
  cod: { pending: string; collected: string; remitted: string };
  revenue: { pending: string; collected: string; remitted: string };
  notifications: { sent: number; failed: number };
}

export type VehicleType = "MOTORCYCLE" | "CAR" | "VAN" | "TRUCK" | "BICYCLE";
export type DriverStatus = "AVAILABLE" | "BUSY" | "OFFLINE";

export interface Driver {
  id: string;
  name: string;
  phone: string | null;
  vehicleType: VehicleType;
  vehiclePlate: string | null;
  status: DriverStatus;
  zoneId: string | null;
  userId: string | null;
  createdAt: string;
}

export type RouteStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type StopType = "PICKUP" | "DELIVERY";
export type StopStatus = "PENDING" | "ARRIVED" | "COMPLETED" | "FAILED";

export interface ProofOfDelivery {
  id: string;
  receivedBy: string | null;
  signatureUrl: string | null;
  photoUrl: string | null;
  failureReason: string | null;
  lat: number | null;
  lng: number | null;
  capturedAt: string;
}

export interface RouteStop {
  id: string;
  sequence: number;
  type: StopType;
  status: StopStatus;
  addressLabel: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  shipmentId: string;
  shipment: { trackingNumber: string; status: ShipmentStatus };
  pod: ProofOfDelivery | null;
}

export interface RouteSummary {
  id: string;
  code: string;
  status: RouteStatus;
  scheduledDate: string;
  startedAt: string | null;
  completedAt: string | null;
  driver: Driver;
  _count: { stops: number };
}

export interface RouteDetail {
  id: string;
  code: string;
  status: RouteStatus;
  scheduledDate: string;
  startedAt: string | null;
  completedAt: string | null;
  driver: Driver;
  stops: RouteStop[];
}

export type LockerStatus = "ACTIVE" | "SUSPENDED";
export type PackageStatus =
  | "PRE_ALERTED"
  | "RECEIVED"
  | "CONSOLIDATED"
  | "SHIPPED";
export type CustomsStatus =
  | "PENDING"
  | "IN_REVIEW"
  | "ON_HOLD"
  | "CLEARED"
  | "REJECTED";

export interface Locker {
  id: string;
  code: string;
  customerId: string | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  status: LockerStatus;
  createdAt: string;
}

export interface LockerPackage {
  id: string;
  lockerId: string;
  shipmentId: string | null;
  externalTracking: string | null;
  merchant: string | null;
  description: string | null;
  weightKg: string | null;
  declaredValue: string | null;
  currency: string;
  status: PackageStatus;
  preAlertedAt: string;
  receivedAt: string | null;
}

export interface LockerDetail extends Locker {
  packages: LockerPackage[];
}

export interface LockerPackageWithLocker extends LockerPackage {
  locker: { id: string; code: string; customerName: string };
}

export interface IntakeResult extends LockerPackage {
  matched: boolean;
}

export interface Customer {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  documentId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerListItem extends Customer {
  _count: { lockers: number; shipments: number };
}

export interface CustomerShipmentRow {
  id: string;
  trackingNumber: string;
  type: ShipmentType;
  status: ShipmentStatus;
  createdAt: string;
}

export interface CustomerDetail extends Customer {
  lockers: Locker[];
  shipments: CustomerShipmentRow[];
  paymentSummary: PaymentSummaryRow[];
}

export interface TeamUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  driver?: { id: string; name: string } | null;
  customer?: { id: string; name: string } | null;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  emailVerified?: boolean;
}

export interface CustomsRecord {
  id: string;
  shipmentId: string;
  status: CustomsStatus;
  declaredValue: string | null;
  dutyAmount: string | null;
  taxAmount: string | null;
  handlingFee: string | null;
  totalCharges: string | null;
  currency: string;
  notes: string | null;
  clearedAt: string | null;
}

export type PaymentType = "COD" | "SUBSCRIPTION";
export type PaymentMethod = "CASH" | "CARD" | "TRANSFER";
export type PaymentStatus = "PENDING" | "COLLECTED" | "REMITTED" | "CANCELLED";

export interface Payment {
  id: string;
  shipmentId: string | null;
  type: PaymentType;
  amount: string;
  currency: string;
  method: PaymentMethod | null;
  status: PaymentStatus;
  collectedByDriverId: string | null;
  reference: string | null;
  collectedAt: string | null;
  remittedAt: string | null;
  createdAt: string;
  shipment: { trackingNumber: string; recipientName: string } | null;
}

export interface PaymentSummaryRow {
  status: PaymentStatus;
  count: number;
  amount: string;
}

export type Plan = "FREE" | "STARTER" | "PRO" | "ENTERPRISE";
export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED";

export interface PlanDefinition {
  plan: Plan;
  name: string;
  monthlyAmount: number;
  currency: string;
  shipmentLimit: number | null;
  features: string[];
}

export interface Subscription {
  id: string;
  plan: Plan;
  status: SubscriptionStatus;
  provider: string;
  amount: string;
  currency: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
}

export interface BillingUsage {
  plan: Plan;
  periodStart: string;
  periodEnd: string;
  shipmentLimit: number | null;
  shipmentsUsed: number;
  shipmentsRemaining: number | null;
}

export interface Zone {
  id: string;
  name: string;
  code: string;
  description: string | null;
  centerLat: number | null;
  centerLng: number | null;
  radiusKm: number | null;
  active: boolean;
  createdAt: string;
}

export interface Rate {
  id: string;
  zoneId: string | null;
  name: string;
  baseFee: string;
  perKg: string;
  perKm: string;
  minCharge: string;
  currency: string;
  active: boolean;
  createdAt: string;
}

export interface RateQuote {
  rateId: string;
  currency: string;
  breakdown: {
    baseFee: string;
    weightCharge: string;
    distanceCharge: string;
    subtotal: string;
    minCharge: string;
  };
  total: string;
}

export interface ImportResult {
  createdCount: number;
  failedCount: number;
  created: { line: number; id: string; trackingNumber: string }[];
  errors: { line: number; errors: string[] }[];
}

// Resultado de GET /routing/route/:id (OSRM). `null` cuando no hay geometría
// posible: menos de dos paradas con coordenadas, o el motor apagado.
export interface RoadRoute {
  geometry: [number, number][];
  distanceKm: number;
  durationMin: number;
}

// Resultado de GET /geocoding/search (proxy a Nominatim con caché).
export interface GeocodeResult {
  /** Dirección completa; se muestra en la lista para desambiguar. */
  label: string;
  /** Versión corta; es la que se guarda (los campos topan en 160 caracteres). */
  shortLabel: string;
  lat: number;
  lng: number;
  type: string | null;
}

export type LegStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";

export interface MapPoint {
  label: string;
  lat: number;
  lng: number;
}

export interface PublicTrackingLeg {
  sequence: number;
  mode: string;
  originLabel: string | null;
  destinationLabel: string | null;
  origin: MapPoint | null;
  destination: MapPoint | null;
  status: LegStatus;
  carrier: string | null;
  externalTrackingUrl: string | null;
  etaAt: string | null;
  departedAt: string | null;
  arrivedAt: string | null;
}

export interface PublicTracking {
  trackingNumber: string;
  type: ShipmentType;
  status: ShipmentStatus;
  origin: { label: string | null; country: string | null };
  destination: {
    label: string | null;
    country: string | null;
    lat: number | null;
    lng: number | null;
  };
  estimatedDelivery: string | null;
  currentLeg: {
    sequence: number;
    mode: string;
    originLabel: string | null;
    destinationLabel: string | null;
    status: LegStatus;
    etaAt: string | null;
  } | null;
  legs: PublicTrackingLeg[];
  mapPath: MapPoint[];
  customs: {
    status: CustomsStatus;
    totalCharges: string | null;
    currency: string;
    clearedAt: string | null;
  } | null;
  timeline: {
    status: ShipmentStatus;
    description: string | null;
    locationLabel: string | null;
    lat: number | null;
    lng: number | null;
    occurredAt: string;
  }[];
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ApiKeyCreated extends ApiKey {
  key: string;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEndpointCreated extends WebhookEndpoint {
  secret: string;
}

export interface ShipmentsAnalytics {
  byStatus: { status: ShipmentStatus; count: number }[];
  byType: { type: ShipmentType; count: number }[];
  daily: { date: string; count: number }[];
}

export interface PaymentsAnalytics {
  range: { from: string; to: string };
  breakdown: {
    type: PaymentType;
    status: PaymentStatus;
    count: number;
    amount: string;
  }[];
}

export interface DriversAnalytics {
  range: { from: string; to: string };
  drivers: {
    driverId: string | null;
    name: string | null;
    codCount: number;
    codAmount: string;
  }[];
}

export type CarrierType = "COURIER" | "AIRLINE" | "OCEAN" | "GROUND";

export interface Carrier {
  id: string;
  name: string;
  code: string;
  type: CarrierType;
  trackingUrlTemplate: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NotificationChannel = "SMS" | "EMAIL" | "PUSH" | "WHATSAPP";
export type NotificationStatus = "PENDING" | "SENT" | "FAILED";

export interface NotificationRow {
  id: string;
  shipmentId: string | null;
  channel: NotificationChannel;
  recipient: string;
  type: string;
  title: string | null;
  body: string;
  status: NotificationStatus;
  provider: string;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorRole: Role | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
