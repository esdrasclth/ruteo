import { avisarSesionCambiada } from "./eventos";

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

export const SESSION_KEY = "ruteo.session";

/**
 * La sesión en crudo, sin parsear.
 *
 * La expone `useSesion`, que la necesita como CADENA y no como objeto:
 * `useSyncExternalStore` compara lo que devuelve su lectura entre renders, y
 * un `JSON.parse` da un objeto nuevo cada vez —igual en contenido, distinto en
 * identidad—, lo que deja a React repintando para siempre. Una cadena se
 * compara por valor y el bucle no existe.
 */
export function getSessionRaw(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_KEY);
}

export function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  return parseSession(getSessionRaw());
}

export function setSession(session: Session) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  avisarSesionCambiada();
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
  avisarSesionCambiada();
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
      // **Nunca lanza: devuelve `false` pase lo que pase.**
      //
      // Antes, un fallo de red o un cuerpo ilegible hacían que esta promesa se
      // rechazara, y entonces el `if (!refreshed)` de `api()` no llegaba a
      // correr: ni se limpiaba la sesión ni se redirigía. La sesión muerta se
      // quedaba en `localStorage`, la pantalla reintentaba, volvía a fallar
      // igual, y el usuario se quedaba mirando errores en bucle sin que nada le
      // mandara a iniciar sesión.
      //
      // Un refresco que no se puede completar es un refresco fallido, sea por
      // token caducado o porque no hubo respuesta. La diferencia no cambia lo
      // que hay que hacer.
      try {
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
      } catch {
        clearSession();
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/**
 * Rutas donde un 401 NO significa «tu sesión murió».
 *
 * En `/auth/login` significa contraseña incorrecta; en los flujos de código
 * —restablecer, invitación, verificación— que el código no vale. Todos se usan
 * SIN sesión y por definición, así que mandar a la pantalla de entrada ahí
 * recargaría la propia pantalla en la que está el usuario y se tragaría el
 * mensaje que necesita leer.
 */
const RUTAS_PUBLICAS =
  /^\/(auth\/(login|register|refresh|handoff|forgot-password|reset-password|accept-invitation|verify-email|send-verification)|plans|tracking)/;

function esRutaPublica(path: string): boolean {
  return RUTAS_PUBLICAS.test(path);
}

/**
 * A la pantalla de entrada, una sola vez.
 *
 * Asignar `location.href` no detiene el JavaScript que ya está corriendo: la
 * página sigue viva hasta que el navegador navega, y en ese rato pueden caer
 * varias respuestas 401 más. Sin esta bandera, cada una reasigna la URL y el
 * navegador acumula navegaciones.
 */
let yendoALogin = false;
function irALogin() {
  if (typeof window === "undefined" || yendoALogin) return;
  yendoALogin = true;
  window.location.href = "/login";
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const habiaSesion = getSession() !== null;

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
  if (res.status === 401) {
    // Solo se intenta refrescar si había sesión: sin ella no hay token de
    // refresco que presentar.
    const refreshed = habiaSesion ? await tryRefresh() : false;
    if (!refreshed) {
      // **Quién decide si se redirige es el ENDPOINT, no si había sesión.**
      //
      // Antes la condición era `res.status === 401 && getSession()`, mirado
      // DESPUÉS de la respuesta, y eso dejaba al usuario atrapado: la pantalla
      // de recepción pide tres endpoints a la vez; el primer 401 refresca,
      // falla y limpia la sesión, y a partir de ahí cualquier petición —las
      // otras dos, y todas las que disparen los siguientes renders— ve
      // `getSession()` nulo, se salta esta rama y solo lanza un error. Panel
      // mostrando avisos y reintentando en bucle, sin que nada mande a entrar
      // de nuevo. Es exactamente lo que se reportó.
      //
      // Mirando el endpoint, un 401 en `/lockers` siempre acaba en la pantalla
      // de entrada, haya o no sesión guardada. Y en `/auth/login` nunca: ahí un
      // 401 significa «contraseña incorrecta» y tiene que verse como mensaje,
      // no recargar la pantalla y tragárselo.
      if (!esRutaPublica(path)) irALogin();
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

export type ShipmentEventType =
  | "STATUS_CHANGED"
  | "CUSTOMS_ASSESSED"
  | "CUSTOMS_CLEARED"
  | "DOCUMENT_ADDED"
  | "DOCUMENT_VERIFIED"
  | "CHARGE_ADDED"
  | "CHARGE_COLLECTED"
  | "EXCEPTION_OPENED"
  | "EXCEPTION_RESOLVED"
  | "NOTE";

/** Quién puede ver el evento. `PUBLIC` sale también en el rastreo del cliente. */
export type EventVisibility = "INTERNAL" | "PUBLIC";

export interface ShipmentEvent {
  id: string;
  eventType: ShipmentEventType;
  /**
   * Solo lo llevan los `STATUS_CHANGED`.
   *
   * Era obligatorio hasta la fase 0.2, y por eso lo único registrable era un
   * cambio de estado. Quien pinte un evento tiene que mirar `eventType`.
   */
  status: ShipmentStatus | null;
  visibility: EventVisibility;
  /** Cifras y referencias del hecho. Su forma depende del tipo. */
  metadata: Record<string, unknown> | null;
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
  /** El historial completo del envío, a través de todas sus paradas. */
  deliveryAttempts: DeliveryAttempt[];
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

/**
 * El tablero de operación: una foto del AHORA.
 *
 * No lleva rango de fechas a propósito — es lo que lo separa de `Overview`, que
 * responde «cómo nos fue» sobre un período. Aquí la pregunta es «qué está
 * pasando», y un bulto parado en aduana desde marzo es exactamente el que hay
 * que ver.
 */
export interface TableroOperacion {
  generadoEn: string;
  bodegas: {
    detalle: {
      warehouseId: string | null;
      code: string | null;
      name: string | null;
      country: string | null;
      bultos: number;
    }[];
    /** En bodega pero sin decir en cuál: la recepción todavía no lo pregunta. */
    sinUbicar: number;
  };
  aduana: {
    pendientes: number;
    enRevision: number;
    retenidos: number;
    liberados: number;
    rechazados: number;
  };
  excepciones: {
    abiertas: number;
    sinAsignar: number;
    porSeveridad: { severidad: ExceptionSeverity; cuantas: number }[];
    porTipo: { tipo: ExceptionType; cuantas: number }[];
  };
  ultimaMilla: {
    enRuta: number;
    porReintentar: number;
    enBodega: number;
    enTransito: number;
    tasaPrimerIntento30Dias: number | null;
    entregas30Dias: number;
  };
}

export type DeliveryMode = "HOME" | "BRANCH" | "PICKUP_POINT";

export const DELIVERY_MODE_LABELS: Record<DeliveryMode, string> = {
  HOME: "A domicilio",
  BRANCH: "Retiro en sucursal",
  PICKUP_POINT: "Punto de entrega",
};

/** Una dirección reutilizable del cliente (fase 5.2). */
export interface CustomerAddress {
  id: string;
  customerId: string;
  label: string;
  recipientName: string | null;
  recipientPhone: string | null;
  department: string;
  municipality: string;
  neighborhood: string | null;
  street: string | null;
  reference: string | null;
  lat: number | null;
  lng: number | null;
  isDefault: boolean;
  active: boolean;
}

export type DeliveryOutcome = "SUCCESS" | "FAILED";

export type DeliveryFailureReason =
  | "NO_RECIPIENT"
  | "WRONG_ADDRESS"
  | "PHONE_UNREACHABLE"
  | "CUSTOMER_REFUSED"
  | "BUSINESS_CLOSED"
  | "RESCHEDULED"
  | "OTHER";

/**
 * Cómo se lee cada motivo. Debe coincidir con `MOTIVOS_DE_FALLO` del backend:
 * ahí se usa además para el texto que se guarda en el POD, y dos listas que se
 * separan acaban enseñando etiquetas distintas según la pantalla.
 */
export const MOTIVOS_DE_FALLO: Record<DeliveryFailureReason, string> = {
  NO_RECIPIENT: "No había quien recibiera",
  WRONG_ADDRESS: "La dirección no corresponde",
  PHONE_UNREACHABLE: "El teléfono no contesta",
  CUSTOMER_REFUSED: "El destinatario rechazó el paquete",
  BUSINESS_CLOSED: "Local cerrado",
  RESCHEDULED: "El cliente pidió otro día",
  OTHER: "Otro motivo",
};

/** Un intento de entrega. Uno por visita, salga bien o salga mal. */
export interface DeliveryAttempt {
  id: string;
  /** Cuenta por ENVÍO, no por parada: «intento 3» = se fue tres veces. */
  attemptNumber: number;
  outcome: DeliveryOutcome;
  failureReason: DeliveryFailureReason | null;
  notes: string | null;
  receivedBy: string | null;
  signatureUrl: string | null;
  photoUrl: string | null;
  lat: number | null;
  lng: number | null;
  attemptedAt: string;
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
  attempts: DeliveryAttempt[];
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

/** En qué estado llegó el bulto. Espejo de `PackageCondition` del backend. */
export type PackageCondition = "GOOD" | "DAMAGED" | "WET" | "OPENED";

/**
 * Qué hay dentro, a ojos de la operación. **No es una clasificación
 * arancelaria**: las partidas y los límites de aduana van en `CustomsRule`, que
 * se versiona por fechas porque la normativa cambia.
 */
export type PackageCategory =
  | "ELECTRONICS"
  | "CLOTHING"
  | "FOOTWEAR"
  | "HOME"
  | "AUTO_PARTS"
  | "COSMETICS"
  | "MEDICINE"
  | "DOCUMENTS"
  | "OTHER";

export type PackagePhotoType = "EXTERIOR" | "LABEL" | "CONTENT" | "DAMAGE";

/** Una foto de bulto, ya con su URL firmada —que dura minutos—. */
export interface PackagePhoto {
  id: string;
  type: PackagePhotoType;
  createdAt: string;
  originalName: string | null;
  url: string | null;
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

  // Prealerta: lo que el cliente sabe antes de que el bulto exista.
  storeName: string | null;
  orderNumber: string | null;
  estimatedArrival: string | null;
  category: PackageCategory | null;
  invoiceFileId: string | null;

  // Recepción: lo que mide la bodega. Los TRES pesos se conservan — el real es
  // lo que cobra la aerolínea, el volumétrico justifica el cobro ante el cliente
  // que reclama, y el cobrable es el que se usa.
  lengthCm: string | null;
  widthCm: string | null;
  heightCm: string | null;
  volumetricWeightKg: string | null;
  chargeableWeightKg: string | null;
  pieces: number;
  condition: PackageCondition;
  receivedByUserId: string | null;
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
  /**
   * Foto de perfil, ya firmada y con caducidad de minutos.
   *
   * Es una URL de un solo uso práctico: NO se guarda en la sesión ni en ningún
   * sitio: se pide con `/users/me` cada vez que hace falta pintarla.
   */
  avatarUrl?: string | null;
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

export type PaymentType = "COD" | "SUBSCRIPTION" | "CHARGES";
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

export type ChargeConcept =
  | "FREIGHT"
  | "HANDLING"
  | "FUEL"
  | "INSURANCE"
  | "STORAGE"
  | "DELIVERY"
  | "REPACK"
  | "DUTY"
  | "TAX"
  | "PERMIT"
  | "OTHER";

/** De quién es el dinero: ingreso propio o tributo que solo se traslada. */
export type ChargeKind = "REVENUE" | "PASS_THROUGH";
export type ChargeStatus = "PENDING" | "PAID" | "VOID";

export interface Charge {
  id: string;
  shipmentId: string;
  concept: ChargeConcept;
  kind: ChargeKind;
  status: ChargeStatus;
  amount: string;
  currency: string;
  /** `customs` si salió de la liquidación, `manual` si lo añadió alguien. */
  source: string;
  notes: string | null;
  paidAt: string | null;
  paymentId: string | null;
  createdAt: string;
  shipment: {
    id: string;
    trackingNumber: string;
    recipientName: string;
  } | null;
  payment: { id: string; method: PaymentMethod | null; reference: string | null } | null;
}

/** Cuentas de un conjunto de cargos. Los anulados no entran en ninguna cifra. */
export interface ChargeDesglose {
  /** Ingreso propio. */
  ingreso: string;
  /** Tributo trasladado al Estado. */
  trasladado: string;
  /** Lo emitido: cobrado + pendiente. No es lo ingresado. */
  total: string;
  cobrado: string;
  pendiente: string;
}

export interface ChargesDeEnvio extends ChargeDesglose {
  items: Charge[];
  moneda: string | null;
}

export interface ChargesResumen extends ChargeDesglose {
  desde: string;
  hasta: string;
  porConcepto: { concept: ChargeConcept; amount: string; count: number }[];
}

export interface CobroDeCargos {
  payment: Payment;
  charges: Charge[];
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

/**
 * Ficha de la propia empresa. `facturacion.completa` la calcula el BACKEND: si
 * el panel repitiera la lista de campos obligatorios, añadir uno dejaría esta
 * pantalla diciendo «completo» mientras la contratación se rechaza.
 */
export interface TenantProfile {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  plan: Plan;
  status: "ACTIVE" | "SUSPENDED" | "CANCELLED";
  legalName: string | null;
  taxId: string | null;
  billingEmail: string | null;
  billingAddress: string | null;
  volumetricDivisor: number;
  subscription: {
    status: SubscriptionStatus;
    currentPeriodEnd: string;
    plan: Plan;
  } | null;
  facturacion: {
    completa: boolean;
    faltantes: string[];
  };
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
  /**
   * Solo los eventos públicos, filtrados en el servidor.
   *
   * `status` puede venir nulo: hay hitos que el cliente ve y que no son cambios
   * de estado, como la liberación de aduana o un pago recibido.
   */
  timeline: {
    eventType: ShipmentEventType;
    status: ShipmentStatus | null;
    description: string | null;
    locationLabel: string | null;
    lat: number | null;
    lng: number | null;
    occurredAt: string;
    /** Lo único que se publica de la metadata del evento. */
    importe: { total: string; currency: string } | null;
  }[];
}

export type ApiScope =
  | "SHIPMENTS_READ"
  | "SHIPMENTS_WRITE"
  | "LOCKERS_READ"
  | "LOCKERS_WRITE";

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiScope[];
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

// ---- Fase 2: manifiestos, viajes y excepciones ----

export type WarehouseType = "ORIGIN" | "DESTINATION" | "BRANCH";
export type TripStatus = "PLANNED" | "IN_TRANSIT" | "ARRIVED" | "CANCELLED";
export type ManifestStatus = "DRAFT" | "TRANSMITTED" | "ARRIVED" | "RECONCILED";

export type ExceptionType =
  | "MANIFEST_MISMATCH"
  | "MISSING"
  | "OVERAGE"
  | "DAMAGED"
  | "OVERWEIGHT"
  | "CUSTOMS_HOLD"
  | "DOCUMENTATION_REQUIRED"
  | "ADDRESS_PROBLEM"
  | "OTHER";

export type ExceptionStatus =
  | "OPEN"
  | "INVESTIGATING"
  | "RESOLVED"
  /** Se asume la pérdida. Distinto de RESOLVED: uno se arregló, el otro se pagó. */
  | "WRITTEN_OFF";

export type ExceptionSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  type: WarehouseType;
  country: string;
  city: string | null;
  addressLine: string | null;
  allowsPickup: boolean;
  active: boolean;
}

export interface Trip {
  id: string;
  flightNumber: string | null;
  status: TripStatus;
  departureAt: string | null;
  arrivalAt: string | null;
  carrier: { id: string; name: string } | null;
  origin: { id: string; code: string } | null;
  destination: { id: string; code: string } | null;
  _count?: { manifests: number };
}

export interface ManifestItem {
  id: string;
  shipmentId: string;
  pieces: number;
  weightKg: string;
  description: string | null;
  consignee: string | null;
  freightAmount: string | null;
  fobValue: string | null;
  currency: string;
  /** Lo contado al descargar. Nulo mientras nadie coteje. */
  receivedPieces: number | null;
  receivedWeightKg: string | null;
  shipment: { id: string; trackingNumber: string; status: ShipmentStatus };
}

export interface ManifestRow {
  id: string;
  number: string;
  status: ManifestStatus;
  totalPieces: number;
  totalWeightKg: string;
  receivedPieces: number | null;
  receivedWeightKg: string | null;
  reconciledAt: string | null;
  createdAt: string;
  trip: { id: string; flightNumber: string | null } | null;
  _count: { items: number; exceptions: number };
}

export interface ManifestDetail extends Omit<ManifestRow, "_count" | "trip"> {
  trip: Trip | null;
  items: ManifestItem[];
  exceptions: ExceptionRow[];
}

export interface ExceptionRow {
  id: string;
  type: ExceptionType;
  status: ExceptionStatus;
  severity: ExceptionSeverity;
  description: string;
  expectedValue: string | null;
  actualValue: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  shipmentId: string | null;
  manifestId: string | null;
  shipment?: { id: string; trackingNumber: string; status: ShipmentStatus } | null;
  manifest?: { id: string; number: string } | null;
}

export interface ResumenExcepciones {
  abiertas: number;
  porSeveridad: Partial<Record<ExceptionSeverity, number>>;
}

/** Evidencia adjunta. La URL viene firmada y caduca en minutos. */
export interface ArchivoAdjunto {
  id: string;
  notes: string | null;
  createdAt: string;
  originalName: string | null;
  url: string | null;
}

// ---- Fase 6: posventa ----

export type ClaimType =
  | "DAMAGED"
  | "LOST"
  | "MISSING_ITEM"
  | "WRONG_CHARGE"
  | "OTHER";

export type ClaimStatus =
  | "OPEN"
  | "INVESTIGATING"
  | "APPROVED"
  | "REJECTED"
  | "SETTLED";

export interface Claim {
  id: string;
  number: string;
  type: ClaimType;
  status: ClaimStatus;
  description: string;
  claimedAmount: string | null;
  approvedAmount: string | null;
  currency: string;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  shipmentId: string;
  shipment?: {
    id: string;
    trackingNumber: string;
    status: ShipmentStatus;
  } | null;
  customer?: { id: string; name: string; email: string | null } | null;
  exception?: { id: string; type: ExceptionType } | null;
  charge?: { id: string; concept: string; amount: string } | null;
  refunds?: { id: string; amount: string; status: RefundStatus }[];
}

export interface ClaimFile extends ArchivoAdjunto {
  fromCustomer: boolean;
}

export interface ResumenReclamos {
  abiertos: number;
  porEstado: Partial<Record<ClaimStatus, number>>;
  reclamadoAbierto: string;
}

export type ReturnDestination = "BRANCH" | "SENDER" | "VENDOR" | "ABANDONED";

export type ReturnReason =
  | "UNDELIVERABLE"
  | "REFUSED"
  | "UNCLAIMED"
  | "UNPAID"
  | "CUSTOMS_REJECTED"
  | "DAMAGED"
  | "OTHER";

export type ReturnStatus = "PENDING" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";

export interface Devolucion {
  id: string;
  destination: ReturnDestination;
  reason: ReturnReason;
  status: ReturnStatus;
  notes: string | null;
  attemptsBefore: number | null;
  completedAt: string | null;
  createdAt: string;
  shipmentId: string;
  shipment?: {
    id: string;
    trackingNumber: string;
    status: ShipmentStatus;
    recipientName: string;
  } | null;
  warehouse?: { id: string; name: string; code: string } | null;
}

export interface ResumenDevoluciones {
  abiertas: number;
  porMotivo: Partial<Record<ReturnReason, number>>;
  porDestino: Partial<Record<ReturnDestination, number>>;
}

export type RefundStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface Refund {
  id: string;
  status: RefundStatus;
  amount: string;
  currency: string;
  method: PaymentMethod | null;
  reason: string;
  reference: string | null;
  completedAt: string | null;
  createdAt: string;
  payment?: {
    id: string;
    type: PaymentType;
    amount: string;
    currency: string;
    shipmentId: string | null;
  } | null;
  claim?: { id: string; number: string; type: ClaimType } | null;
}

// ---- Fase 3: reglas aduaneras y expediente documental ----

export type CustomsCategory = "A" | "B" | "C" | "ENVIO_FAMILIAR";

export type DocumentType =
  | "COMMERCIAL_INVOICE"
  | "AIR_WAYBILL"
  | "CUSTOMS_DECLARATION"
  | "PERMIT"
  | "IDENTIFICATION"
  | "OTHER";

export type ValueSource = "CUSTOMER" | "INVOICE" | "ESTIMATED" | "CUSTOMS";

/**
 * Regla aduanera vigente durante un periodo.
 *
 * Se cierra con `effectiveTo`, nunca se borra: una liquidacion vieja tiene que
 * seguir pudiendo explicarse con la regla que se le aplico.
 */
export interface CustomsRule {
  id: string;
  country: string;
  category: CustomsCategory;
  maxValue: string | null;
  currency: string;
  requiresInvoice: boolean;
  requiresPermit: boolean;
  requiresBroker: boolean;
  /** Fraccion, no porcentaje: 0.15 es el 15 %. */
  dutyRate: string;
  taxRate: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/** Un documento del expediente, ya con URL firmada —que dura minutos—. */
export interface ShipmentDocument {
  id: string;
  type: DocumentType;
  notes: string | null;
  verifiedAt: string | null;
  createdAt: string;
  originalName: string | null;
  contentType: string;
  url: string | null;
}

/**
 * De donde salieron las cifras de una liquidacion.
 *
 * `defecto` significa que el tenant no tiene reglas configuradas y se uso el
 * calculo antiguo. Se muestra en pantalla a proposito: un cobro con cifras que
 * nadie configuro tiene que verse.
 */
export type FuenteLiquidacion = "regla" | "manual" | "defecto";

export interface CustomsRecordDetalle extends CustomsRecord {
  category: CustomsCategory | null;
  productValue: string | null;
  freightAmount: string | null;
  insuranceAmount: string | null;
  otherCharges: string | null;
  customsValue: string | null;
  valueSource: ValueSource | null;
  rule: CustomsRule | null;
  /** Documentos que la regla exige y todavia no estan. */
  faltan: string[];
  fuente?: FuenteLiquidacion;
}
