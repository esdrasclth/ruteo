import { Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import {
  BillingProvider,
  CancelSubscriptionInput,
  CancelSubscriptionResult,
  StartSubscriptionInput,
  StartSubscriptionResult,
} from './billing-provider';

const PERIOD_DAYS = 30;

// Activates subscriptions immediately with a 30-day period and no external
// charge. Used when no payment processor is configured (BILLING_PROVIDER=manual).
@Injectable()
export class ManualBillingProvider implements BillingProvider {
  readonly name = 'manual';

  // No cobra: activa y ya. Por eso `BillingService` no deja subir de plan
  // mientras este sea el proveedor —el cobro lo acuerda y lo aplica alguien de
  // la casa desde el panel de plataforma, que es lo que "manual" significa—.
  readonly cobra = false;

  startSubscription(
    _input: StartSubscriptionInput,
  ): Promise<StartSubscriptionResult> {
    void _input;
    const now = new Date();
    const end = new Date(now.getTime() + PERIOD_DAYS * 24 * 60 * 60 * 1000);
    return Promise.resolve({
      providerRef: null,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: end,
    });
  }

  cancelSubscription(
    input: CancelSubscriptionInput,
  ): Promise<CancelSubscriptionResult> {
    if (input.atPeriodEnd) {
      return Promise.resolve({
        status: SubscriptionStatus.ACTIVE,
        canceledAt: null,
      });
    }
    return Promise.resolve({
      status: SubscriptionStatus.CANCELED,
      canceledAt: new Date(),
    });
  }
}
