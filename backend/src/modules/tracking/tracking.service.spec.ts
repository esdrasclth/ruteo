import { LegStatus } from '@prisma/client';
import { resolveCurrentLeg, resolveDeliveryEta } from './tracking.service';

const leg = (
  sequence: number,
  status: LegStatus,
  etaAt: Date | null = null,
) => ({ sequence, status, etaAt });

describe('tracking público: tramo y ETA', () => {
  it('elige el tramo en progreso aunque exista uno pendiente anterior', () => {
    const actual = resolveCurrentLeg([
      leg(2, LegStatus.IN_PROGRESS),
      leg(1, LegStatus.PENDING),
    ]);

    expect(actual?.sequence).toBe(2);
  });

  it('elige el próximo pendiente cuando todavía no hay uno en progreso', () => {
    const actual = resolveCurrentLeg([
      leg(3, LegStatus.PENDING),
      leg(1, LegStatus.COMPLETED),
      leg(2, LegStatus.PENDING),
    ]);

    expect(actual?.sequence).toBe(2);
    expect(actual?.status).toBe(LegStatus.PENDING);
  });

  it('no presenta un tramo completado como actual', () => {
    expect(
      resolveCurrentLeg([
        leg(1, LegStatus.COMPLETED),
        leg(2, LegStatus.COMPLETED),
      ]),
    ).toBeNull();
  });

  it('usa la ETA del último tramo y no la del próximo transbordo', () => {
    const aduana = new Date('2026-09-02T12:00:00.000Z');
    const entrega = new Date('2026-09-04T18:00:00.000Z');

    expect(
      resolveDeliveryEta([
        leg(2, LegStatus.PENDING, entrega),
        leg(1, LegStatus.IN_PROGRESS, aduana),
      ]),
    ).toEqual(entrega);
  });

  it('no inventa una ETA final a partir de un tramo intermedio', () => {
    expect(
      resolveDeliveryEta([
        leg(1, LegStatus.IN_PROGRESS, new Date('2026-09-02T12:00:00.000Z')),
        leg(2, LegStatus.PENDING, null),
      ]),
    ).toBeNull();
  });

  it('oculta la estimación cuando el recorrido ya terminó', () => {
    expect(
      resolveDeliveryEta([
        leg(1, LegStatus.COMPLETED, new Date('2026-09-02T12:00:00.000Z')),
      ]),
    ).toBeNull();
  });
});
