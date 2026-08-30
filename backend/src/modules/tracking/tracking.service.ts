import { Injectable, NotFoundException } from '@nestjs/common';
import { LegStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildTrackingUrl } from '../carriers/carrier-tracking';
import { FILTRO_PUBLICO } from '../shipments/eventos';

/**
 * Lo único que se publica de la `metadata` de un evento: cuánto y en qué moneda.
 *
 * En lista blanca y no quitando lo sensible: una lista negra hay que acordarse
 * de actualizarla cada vez que un evento nuevo guarda un dato más, y el día que
 * no se haga, ese dato sale al mundo sin que nadie lo note.
 */
function importePublico(
  metadata: Prisma.JsonValue | null,
): { total: string; currency: string } | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const total = metadata.total ?? metadata.amount;
  const currency = metadata.currency;
  if (typeof total !== 'string' || typeof currency !== 'string') return null;
  return { total, currency };
}

const trackingInclude = {
  legs: {
    orderBy: { sequence: 'asc' },
    include: { carrierRef: true },
  },
  // **El filtro va en la consulta, no en el `map` de abajo.** Traerse todos los
  // eventos y descartar los internos al construir la respuesta funciona igual de
  // bien hasta el día en que alguien añade un campo al proyectado; entonces el
  // trabajo interno de la empresa sale por un endpoint que no pide sesión.
  events: { where: FILTRO_PUBLICO, orderBy: { occurredAt: 'asc' } },
  customs: true,
} satisfies Prisma.ShipmentInclude;

type TrackedShipment = Prisma.ShipmentGetPayload<{
  include: typeof trackingInclude;
}>;
type TrackedLeg = TrackedShipment['legs'][number];

type LegForProgress = Pick<TrackedLeg, 'status' | 'sequence'>;
type LegForEta = Pick<TrackedLeg, 'status' | 'sequence' | 'etaAt'>;

/** El tramo operativo: primero el que avanza y, si aún no arrancó, el próximo. */
export function resolveCurrentLeg<T extends LegForProgress>(
  legs: T[],
): T | null {
  const ordenados = [...legs].sort((a, b) => a.sequence - b.sequence);
  return (
    ordenados.find((leg) => leg.status === LegStatus.IN_PROGRESS) ??
    ordenados.find((leg) => leg.status === LegStatus.PENDING) ??
    null
  );
}

/**
 * ETA de entrega, no ETA del siguiente transbordo.
 *
 * Solo el último tramo termina en el destino final. Si todavía no tiene ETA,
 * enseñar la de Miami→aduana como “entrega estimada” sería una precisión falsa.
 */
export function resolveDeliveryEta(legs: LegForEta[]): Date | null {
  const ultimo = [...legs].sort((a, b) => b.sequence - a.sequence)[0];
  if (!ultimo || ultimo.status === LegStatus.COMPLETED) return null;
  return ultimo.etaAt;
}

export interface MapPoint {
  label: string;
  lat: number;
  lng: number;
}

@Injectable()
export class TrackingService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicTracking(trackingNumber: string) {
    const rows = await this.prisma.$queryRaw<
      { tenant_id_by_tracking: string | null }[]
    >`SELECT tenant_id_by_tracking(${trackingNumber})`;
    const tenantId = rows[0]?.tenant_id_by_tracking;
    if (!tenantId) {
      throw new NotFoundException('Tracking number not found');
    }

    const shipment = await this.prisma.withTenant(tenantId, (tx) =>
      tx.shipment.findUnique({
        where: { trackingNumber },
        include: trackingInclude,
      }),
    );
    if (!shipment) {
      throw new NotFoundException('Tracking number not found');
    }
    return this.toPublicView(shipment);
  }

  // Public-safe projection: milestones + current leg + map path, without
  // exposing internal or sensitive fields (declared value, COD, phone, ids).
  private toPublicView(shipment: TrackedShipment) {
    const currentLeg = resolveCurrentLeg(shipment.legs);
    const deliveryEta = resolveDeliveryEta(shipment.legs);

    return {
      trackingNumber: shipment.trackingNumber,
      type: shipment.type,
      status: shipment.status,
      origin: {
        label: shipment.originLabel,
        country: shipment.originCountry,
      },
      destination: {
        label: shipment.destinationLabel,
        country: shipment.destinationCountry,
        lat: shipment.destinationLat,
        lng: shipment.destinationLng,
      },
      estimatedDelivery: deliveryEta,
      currentLeg: currentLeg
        ? {
            sequence: currentLeg.sequence,
            mode: currentLeg.mode,
            originLabel: currentLeg.originLabel,
            destinationLabel: currentLeg.destinationLabel,
            status: currentLeg.status,
            etaAt: currentLeg.etaAt,
          }
        : null,
      legs: shipment.legs.map((leg) => ({
        sequence: leg.sequence,
        mode: leg.mode,
        originLabel: leg.originLabel,
        destinationLabel: leg.destinationLabel,
        origin: this.coords(leg.originLat, leg.originLng),
        destination: this.coords(leg.destinationLat, leg.destinationLng),
        status: leg.status,
        carrier: leg.carrierRef?.name ?? leg.carrier ?? null,
        externalTrackingUrl: buildTrackingUrl(
          leg.carrierRef?.trackingUrlTemplate,
          leg.externalTracking,
        ),
        etaAt: leg.etaAt,
        departedAt: leg.departedAt,
        arrivedAt: leg.arrivedAt,
      })),
      // Ordered geo path (leg origins/destinations + final destination) so the
      // client can draw "where is my package" on a map.
      mapPath: this.buildMapPath(shipment),
      customs: shipment.customs
        ? {
            status: shipment.customs.status,
            totalCharges: shipment.customs.totalCharges,
            currency: shipment.customs.currency,
            clearedAt: shipment.customs.clearedAt,
          }
        : null,
      // `status` puede venir nulo: desde la fase 0.2 hay hitos que el cliente ve
      // y que no son cambios de estado —«liberado de aduana», «pago recibido»—.
      // Quien pinte esto tiene que apoyarse en `eventType`, no en el estado.
      timeline: shipment.events.map((event) => ({
        eventType: event.eventType,
        status: event.status,
        description: event.description,
        locationLabel: event.locationLabel,
        lat: event.lat,
        lng: event.lng,
        occurredAt: event.occurredAt,
        // La metadata NO se expone tal cual: lleva ids internos y cifras de
        // trabajo. Solo salen las tres que el cliente entiende y ya paga.
        importe: importePublico(event.metadata),
      })),
    };
  }

  private coords(lat: number | null, lng: number | null): MapPoint | null {
    return lat !== null && lng !== null ? { label: '', lat, lng } : null;
  }

  private buildMapPath(shipment: TrackedShipment): MapPoint[] {
    const path: MapPoint[] = [];
    const push = (label: string, lat: number | null, lng: number | null) => {
      if (lat === null || lng === null) {
        return;
      }
      const last = path[path.length - 1];
      if (last && last.lat === lat && last.lng === lng) {
        return; // collapse shared leg endpoints
      }
      path.push({ label, lat, lng });
    };

    for (const leg of shipment.legs) {
      push(leg.originLabel, leg.originLat, leg.originLng);
      push(leg.destinationLabel, leg.destinationLat, leg.destinationLng);
    }
    push(
      shipment.destinationLabel ?? 'Destino',
      shipment.destinationLat,
      shipment.destinationLng,
    );
    return path;
  }
}
