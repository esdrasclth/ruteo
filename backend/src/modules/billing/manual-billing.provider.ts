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

  startSubscription(
    _input: StartSubscriptionInput,
  ): Promise<StartSubscriptionResult> {
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
