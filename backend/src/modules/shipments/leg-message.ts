import { LegMode, LegStatus } from '@prisma/client';

const MODE_LABELS: Record<LegMode, string> = {
  [LegMode.AIR]: 'aéreo',
  [LegMode.SEA]: 'marítimo',
  [LegMode.GROUND]: 'terrestre',
};

interface LegRef {
  mode: LegMode;
  originLabel?: string | null;
  destinationLabel?: string | null;
  carrier?: string | null;
}

export function legStatusMessage(
  trackingNumber: string,
  status: LegStatus,
  leg: LegRef,
): string {
  const mode = MODE_LABELS[leg.mode];
  const carrier = leg.carrier ? ` con ${leg.carrier}` : '';
  const route =
    leg.originLabel && leg.destinationLabel
      ? ` de ${leg.originLabel} a ${leg.destinationLabel}`
      : leg.destinationLabel
        ? ` hacia ${leg.destinationLabel}`
        : '';

  if (status === LegStatus.IN_PROGRESS) {
    return `Tu envío ${trackingNumber} inició su tramo ${mode}${route}${carrier}.`;
  }
  const arrival = leg.destinationLabel
    ? ` llegando a ${leg.destinationLabel}`
    : '';
  return `Tu envío ${trackingNumber} completó su tramo ${mode}${arrival}${carrier}.`;
}
