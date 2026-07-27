import { Prisma } from '@prisma/client';

// Default Honduras import charges: arancel (duty) + ISV (sales tax, 15%).
// Both are overridable per record since rates vary by product category.
export const DEFAULT_DUTY_RATE = 0.15;
export const DEFAULT_TAX_RATE = 0.15;

export interface ChargeInput {
  declaredValue?: Prisma.Decimal.Value | null;
  dutyRate?: number;
  taxRate?: number;
  handlingFee?: Prisma.Decimal.Value | null;
}

export interface ComputedCharges {
  dutyAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  handlingFee: Prisma.Decimal;
  totalCharges: Prisma.Decimal;
}

// duty = value * dutyRate; tax = (value + duty) * taxRate; total adds handling.
export function computeCharges(input: ChargeInput): ComputedCharges {
  const value = new Prisma.Decimal(input.declaredValue ?? 0);
  const dutyRate = input.dutyRate ?? DEFAULT_DUTY_RATE;
  const taxRate = input.taxRate ?? DEFAULT_TAX_RATE;
  const handlingFee = new Prisma.Decimal(input.handlingFee ?? 0);

  const dutyAmount = value.mul(dutyRate);
  const taxAmount = value.plus(dutyAmount).mul(taxRate);
  const totalCharges = dutyAmount.plus(taxAmount).plus(handlingFee);

  return { dutyAmount, taxAmount, handlingFee, totalCharges };
}
