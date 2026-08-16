import { API_URL, ApiError } from "@/lib/api";
import { avisarSesionCambiada } from "@/lib/eventos";

// Cliente del panel de plataforma.
//
// Sesión y clave de almacenamiento PROPIAS, separadas de las de tenant. No es
// cosmético: con una sola clave, cerrar sesión en un lado cerraría el otro, y
// —peor— un fallo de código podría mandar el token de plataforma a un endpoint
// de empresa o al revés. Aquí ni siquiera comparten el objeto de sesión.

export const PLATFORM_SESSION_KEY = "ruteo.platform.session";

export interface PlatformSession {
  accessToken: string;
  email: string;
}

/**
 * La sesión en crudo. `usePlatformSesion` la necesita como CADENA: ver la
 * explicación en `getSessionRaw` de `api.ts` —un objeto reparseado en cada
 * lectura deja a `useSyncExternalStore` repintando para siempre.
 */
export function getPlatformSessionRaw(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PLATFORM_SESSION_KEY);
}

export function parsePlatformSession(raw: string | null): PlatformSession | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlatformSession;
  } catch {
    return null;
  }
}

export function getPlatformSession(): PlatformSession | null {
  return parsePlatformSession(getPlatformSessionRaw());
}

export function setPlatformSession(s: PlatformSession) {
  window.localStorage.setItem(PLATFORM_SESSION_KEY, JSON.stringify(s));
  avisarSesionCambiada();
}

export function clearPlatformSession() {
  window.localStorage.removeItem(PLATFORM_SESSION_KEY);
  avisarSesionCambiada();
}

export async function platformApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const session = getPlatformSession();
  const res = await fetch(`${API_URL}/platform${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    let mensaje = `Error ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) {
        mensaje = Array.isArray(body.message)
          ? body.message.join(", ")
          : body.message;
      }
    } catch {
      // respuesta sin cuerpo JSON
    }
    // El token de plataforma dura 30 minutos y no hay refresh a propósito: al
    // caducar se limpia y se vuelve a pedir credenciales.
    if (res.status === 401) clearPlatformSession();
    throw new ApiError(res.status, mensaje);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// --- tipos que devuelve el backend ------------------------------------------

export type Plan = "FREE" | "STARTER" | "PRO" | "ENTERPRISE";
export type TenantStatus = "ACTIVE" | "SUSPENDED" | "CANCELLED";

export interface TenantResumen {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  status: TenantStatus;
  statusReason: string | null;
  createdAt: string;
  usuarios: number;
  envios: number;
}

export interface ModuloEstado {
  key: string;
  label: string;
  grupo: string;
  esencial?: boolean;
  activo: boolean;
  incluidoEnPlan: boolean;
  excepcion: { enabled: boolean; reason: string | null } | null;
}

export interface TenantDetalle {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  status: TenantStatus;
  statusReason: string | null;
  statusAt: string | null;
  createdAt: string;
  planInfo: {
    name: string;
    monthlyAmount: number;
    currency: string;
    shipmentLimit: number | null;
  };
  usuarios: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    status: string;
    emailVerified: boolean;
  }[];
  uso: {
    shipments: number;
    customers: number;
    drivers: number;
    routes: number;
  };
  modulos: ModuloEstado[];
}

export interface PlatformResumen {
  tenants: number;
  envios: number;
  porEstado: Partial<Record<TenantStatus, number>>;
  porPlan: Partial<Record<Plan, number>>;
}

export interface PlatformAdmin {
  id: string;
  email: string;
  name: string | null;
  status: "ACTIVE" | "DISABLED";
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  ip: string | null;
  createdAt: string;
}

// Los textos viven en el frontend y las acciones son claves estables en el
// backend: renombrar una etiqueta no debe reescribir el historial guardado.
export const ACCION_TEXTO: Record<string, string> = {
  "tenant.plan_changed": "Cambió el plan",
  "tenant.suspended": "Suspendió la empresa",
  "tenant.reactivated": "Reactivó la empresa",
  "tenant.module_enabled": "Activó un módulo",
  "tenant.module_disabled": "Desactivó un módulo",
  "admin.enabled": "Activó un superadmin",
  "admin.disabled": "Desactivó un superadmin",
};

export interface Salud {
  ventanaHoras: number;
  notificacionesFallidas: number;
  notificacionesPendientes: number;
  webhooksFallidos: number;
  empresasConFallos: {
    tenant: { id: string; name: string; slug: string } | null;
    fallos: number;
  }[];
}

export interface UsoPlan {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  status: TenantStatus;
  limite: number | null;
  usados: number;
  porcentaje: number | null;
}

export interface Ingresos {
  moneda: string;
  mrr: number;
  porPlan: { plan: Plan; cuentas: number; monto: number }[];
  empresasEnPlanGratuito: number;
}

interface RefTenant {
  id: string;
  name: string;
  slug: string;
}

export interface Busqueda {
  empresas: { id: string; name: string; slug: string; status: TenantStatus }[];
  envios: {
    id: string;
    trackingNumber: string;
    status: string;
    createdAt: string;
    tenant: RefTenant;
  }[];
  clientes: {
    id: string;
    name: string;
    email: string | null;
    tenant: RefTenant;
  }[];
  usuarios: { id: string; email: string; role: string; tenant: RefTenant }[];
}
