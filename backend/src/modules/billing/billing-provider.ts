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
  startSubscription(
    input: StartSubscriptionInput,
  ): Promise<StartSubscriptionResult>;
  cancelSubscription(
    input: CancelSubscriptionInput,
  ): Promise<CancelSubscriptionResult>;
}
