import { SubscriptionStatus } from '@prisma/client';
import { PlanDefinition } from './plans';

export const BILLING_PROVIDER = 'BILLING_PROVIDER';

export interface StartSubscriptionInput {
  tenantId: string;
  plan: PlanDefinition;
}

export interface StartSubscriptionResult {
  providerRef: string | null;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

export interface CancelSubscriptionInput {
  providerRef: string | null;
  atPeriodEnd: boolean;
}

export interface CancelSubscriptionResult {
  status: SubscriptionStatus;
  canceledAt: Date | null;
}

// Seam between our billing domain and an external processor. A real Stripe
// implementation plugs in here without touching the service. The default
// ManualBillingProvider keeps the whole flow internal and testable.
export interface BillingProvider {
  readonly name: string;

  /**
   * ¿Este proveedor cobra de verdad antes de activar?
   *
   * Es la diferencia entre "el plan está activo porque alguien pagó" y "el plan
   * está activo porque alguien lo pidió". `BillingService` lo consulta para
   * negarse a SUBIR de plan cuando nadie va a cobrar: sin esta comprobación,
   * cualquier OWNER o ADMIN se ponía en ENTERPRISE con una petición y se
   * llevaba los catorce módulos y el tope de envíos por delante.
   *
   * Bajar de plan y renovar el que ya se tiene siguen permitidos: quien deja de
   * pagar tiene que poder dejar de pagar sin pedir permiso.
   */
  readonly cobra: boolean;

  startSubscription(
    input: StartSubscriptionInput,
  ): Promise<StartSubscriptionResult>;
  cancelSubscription(
    input: CancelSubscriptionInput,
  ): Promise<CancelSubscriptionResult>;
}
