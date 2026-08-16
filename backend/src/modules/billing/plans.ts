import { Plan, SubscriptionStatus } from '@prisma/client';

export interface PlanDefinition {
  plan: Plan;
  name: string;
  monthlyAmount: number;
  currency: string;
  shipmentLimit: number | null;
  features: string[];
}

// Static plan catalog. Prices are in HNL/month; `shipmentLimit` null = unlimited.
//
// **`features` es un RESUMEN de venta, no la fuente de la verdad.** Quién puede
// entrar a qué lo decide `MODULOS_POR_PLAN` en `platform/modules.catalog.ts`, y
// es lo único que aplican los guards. Esto son las cuatro líneas que se pintan
// en la pantalla de Facturación y en la landing, agrupadas para que se lean.
//
// Al tocar el catálogo hay que repasar esta lista, porque nada obliga a que
// cuadren: así fue como el plan FREE acabó anunciando «1 usuario» —un límite
// que no existe en ningún sitio del código— y PRO se dejaba fuera casilleros y
// aduana, que son justamente lo que ese plan abre.
export const PLANS: Record<Plan, PlanDefinition> = {
  [Plan.FREE]: {
    plan: Plan.FREE,
    name: 'Free',
    monthlyAmount: 0,
    currency: 'HNL',
    shipmentLimit: 50,
    // SHIPMENTS, CUSTOMERS, BILLING, NOTIFICATIONS.
    features: ['Envíos y clientes', 'Rastreo público', 'Avisos automáticos'],
  },
  [Plan.STARTER]: {
    plan: Plan.STARTER,
    name: 'Starter',
    monthlyAmount: 490,
    currency: 'HNL',
    shipmentLimit: 500,
    // + ROUTES, DRIVERS, INTAKE, PRICING, INTEGRATIONS.
    features: [
      'Rutas y repartidores',
      'Recepción en bodega',
      'Zonas y tarifas',
      'Llaves de API y webhooks',
    ],
  },
  [Plan.PRO]: {
    plan: Plan.PRO,
    name: 'Pro',
    monthlyAmount: 1490,
    currency: 'HNL',
    shipmentLimit: 5000,
    // + LOCKERS, CUSTOMS, CARRIERS, MANIFESTS, EXCEPTIONS, PAYMENTS,
    // AFTERSALES, AUDIT.
    features: [
      'Casilleros y aduana',
      'Manifiestos y excepciones',
      'Cobros y posventa',
      'Auditoría',
    ],
  },
  [Plan.ENTERPRISE]: {
    plan: Plan.ENTERPRISE,
    name: 'Enterprise',
    monthlyAmount: 4990,
    currency: 'HNL',
    shipmentLimit: null,
    features: ['Los 17 módulos', 'Soporte dedicado'],
  },
};

export function getPlan(plan: Plan): PlanDefinition {
  return PLANS[plan];
}

/**
 * Cuánto dura la prueba que abre el registro al elegir un plan de pago.
 *
 * Catorce días y no treinta: es tiempo suficiente para que un courier mueva
 * paquetes de verdad y vea si le sirve, y corto para que la conversación
 * comercial ocurra mientras todavía se acuerdan de que se registraron.
 *
 * Al vencer, la empresa NO se queda fuera: cae a FREE. Cortarle el acceso a
 * alguien que metió su operación dentro sería la forma más rápida de que no
 * vuelva.
 */
export const DIAS_DE_PRUEBA = 14;

/**
 * ¿Sigue viva esta prueba?
 *
 * Se usa en el guard que resuelve el plan efectivo en cada petición, y no solo
 * en el trabajo que caduca las pruebas. Depender únicamente del trabajo
 * programado significaría que un Redis caído regala planes de pago
 * indefinidamente, y eso no se nota: nadie reclama que le sobra plan.
 */
export function pruebaVigente(
  status: SubscriptionStatus,
  finDePeriodo: Date,
  ahora: Date = new Date(),
): boolean {
  return status === SubscriptionStatus.TRIALING && finDePeriodo > ahora;
}

/**
 * El plan que de verdad aplica ahora mismo.
 *
 * Una prueba vencida vale lo mismo que no tener plan, aunque `Tenant.plan` siga
 * diciendo PRO porque el trabajo de caducidad no ha corrido todavía.
 */
export function planEfectivo(
  planDelTenant: Plan,
  suscripcion: { status: SubscriptionStatus; currentPeriodEnd: Date } | null,
  ahora: Date = new Date(),
): Plan {
  if (!suscripcion) return planDelTenant;
  if (suscripcion.status !== SubscriptionStatus.TRIALING) return planDelTenant;
  return pruebaVigente(suscripcion.status, suscripcion.currentPeriodEnd, ahora)
    ? planDelTenant
    : Plan.FREE;
}
