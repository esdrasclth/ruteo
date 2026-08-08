import { Plan, TenantModule } from '@prisma/client';

// Qué módulos trae cada plan. Es el DEFECTO: el superadmin puede desviarse por
// empresa con `TenantModuleOverride`, y solo se guarda la desviación —así, al
// subir de plan, el tenant hereda lo nuevo sin reescribir nada.

export interface ModuloInfo {
  key: TenantModule;
  label: string;
  /// Sección del panel a la que corresponde, para pintarlo agrupado.
  grupo: 'Operación' | 'Comercial' | 'Administración';
  /// Los que NO se pueden apagar: sin ellos el panel no tiene sentido y
  /// apagarlos dejaría a la empresa mirando una pantalla vacía sin saber por qué.
  esencial?: boolean;
}

export const MODULOS: ModuloInfo[] = [
  {
    key: TenantModule.SHIPMENTS,
    label: 'Envíos',
    grupo: 'Operación',
    esencial: true,
  },
  { key: TenantModule.ROUTES, label: 'Rutas', grupo: 'Operación' },
  { key: TenantModule.DRIVERS, label: 'Repartidores', grupo: 'Operación' },
  { key: TenantModule.INTAKE, label: 'Recepción', grupo: 'Operación' },
  { key: TenantModule.LOCKERS, label: 'Casilleros', grupo: 'Operación' },
  { key: TenantModule.CARRIERS, label: 'Transportistas', grupo: 'Operación' },
  { key: TenantModule.CUSTOMS, label: 'Aduana', grupo: 'Operación' },
  {
    key: TenantModule.CUSTOMERS,
    label: 'Clientes',
    grupo: 'Comercial',
    esencial: true,
  },
  { key: TenantModule.PRICING, label: 'Zonas y tarifas', grupo: 'Comercial' },
  { key: TenantModule.PAYMENTS, label: 'Pagos', grupo: 'Comercial' },
  {
    key: TenantModule.BILLING,
    label: 'Facturación',
    grupo: 'Comercial',
    esencial: true,
  },
  {
    key: TenantModule.NOTIFICATIONS,
    label: 'Notificaciones',
    grupo: 'Administración',
  },
  { key: TenantModule.AUDIT, label: 'Auditoría', grupo: 'Administración' },
  {
    key: TenantModule.INTEGRATIONS,
    label: 'Integraciones (API)',
    grupo: 'Administración',
  },
];

const T = TenantModule;

/** Módulos que trae cada plan de fábrica. */
export const MODULOS_POR_PLAN: Record<Plan, TenantModule[]> = {
  [Plan.FREE]: [T.SHIPMENTS, T.CUSTOMERS, T.BILLING, T.NOTIFICATIONS],
  [Plan.STARTER]: [
    T.SHIPMENTS,
    T.CUSTOMERS,
    T.BILLING,
    T.NOTIFICATIONS,
    T.ROUTES,
    T.DRIVERS,
    T.PRICING,
    T.INTAKE,
    T.INTEGRATIONS,
  ],
  [Plan.PRO]: [
    T.SHIPMENTS,
    T.CUSTOMERS,
    T.BILLING,
    T.NOTIFICATIONS,
    T.ROUTES,
    T.DRIVERS,
    T.PRICING,
    T.INTAKE,
    T.INTEGRATIONS,
    T.LOCKERS,
    T.CARRIERS,
    T.CUSTOMS,
    T.PAYMENTS,
    T.AUDIT,
  ],
  [Plan.ENTERPRISE]: MODULOS.map((m) => m.key),
};

export const ESENCIALES = new Set(
  MODULOS.filter((m) => m.esencial).map((m) => m.key),
);

/**
 * Módulos efectivos = los del plan, con las excepciones aplicadas encima.
 *
 * Los esenciales se fuerzan a activo aunque una excepción diga lo contrario:
 * una fila antigua no debería poder dejar a una empresa sin poder ver sus
 * propios envíos.
 */
export function modulosEfectivos(
  plan: Plan,
  excepciones: { module: TenantModule; enabled: boolean }[],
): TenantModule[] {
  const activos = new Set(MODULOS_POR_PLAN[plan]);
  for (const e of excepciones) {
    if (e.enabled) activos.add(e.module);
    else if (!ESENCIALES.has(e.module)) activos.delete(e.module);
  }
  for (const esencial of ESENCIALES) activos.add(esencial);
  return MODULOS.map((m) => m.key).filter((k) => activos.has(k));
}
