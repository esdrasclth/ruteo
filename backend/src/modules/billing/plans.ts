import { Plan } from '@prisma/client';

export interface PlanDefinition {
  plan: Plan;
  name: string;
  monthlyAmount: number;
  currency: string;
  shipmentLimit: number | null;
  features: string[];
}

// Static plan catalog. Prices are in HNL/month; `shipmentLimit` null = unlimited.
export const PLANS: Record<Plan, PlanDefinition> = {
  [Plan.FREE]: {
    plan: Plan.FREE,
    name: 'Free',
    monthlyAmount: 0,
    currency: 'HNL',
    shipmentLimit: 50,
    features: ['Rastreo básico', '1 usuario'],
  },
  [Plan.STARTER]: {
    plan: Plan.STARTER,
    name: 'Starter',
    monthlyAmount: 490,
    currency: 'HNL',
    shipmentLimit: 500,
    features: ['Rutas', 'Etiquetas', 'API keys'],
  },
  [Plan.PRO]: {
    plan: Plan.PRO,
    name: 'Pro',
    monthlyAmount: 1490,
    currency: 'HNL',
    shipmentLimit: 5000,
    features: ['Webhooks', 'Importación CSV', 'COD'],
  },
  [Plan.ENTERPRISE]: {
    plan: Plan.ENTERPRISE,
    name: 'Enterprise',
    monthlyAmount: 4990,
    currency: 'HNL',
    shipmentLimit: null,
    features: ['Todo incluido', 'Soporte dedicado'],
  },
};

export function getPlan(plan: Plan): PlanDefinition {
  return PLANS[plan];
}
