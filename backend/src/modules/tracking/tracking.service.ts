import { Injectable, NotFoundException } from '@nestjs/common';
import { LegStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildTrackingUrl } from '../carriers/carrier-tracking';

const trackingInclude = {
  legs: {
    orderBy: { sequence: 'asc' },
    include: { carrierRef: true },
  },
  events: { orderBy: { occurredAt: 'asc' } },
  customs: true,
} satisfies Prisma.ShipmentInclude;

type TrackedShipment = Prisma.ShipmentGetPayload<{
  include: typeof trackingInclude;
}>;
type TrackedLeg = TrackedShipment['legs'][number];

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
    const currentLeg = this.resolveCurrentLeg(shipment.legs);
    const nextEta = shipment.legs
      .map((leg) => leg.etaAt)
      .filter((eta): eta is Date => eta !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0];

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
      estimatedDelivery: nextEta ?? null,
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
      timeline: shipment.events.map((event) => ({
        status: event.status,
        description: event.description,
        locationLabel: event.locationLabel,
        lat: event.lat,
        lng: event.lng,
        occurredAt: event.occurredAt,
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

  private resolveCurrentLeg(legs: TrackedLeg[]) {
    const inProgress = legs.find((leg) => leg.status === LegStatus.IN_PROGRESS);
    if (inProgress) {
      return inProgress;
    }
    const completed = [...legs]
      .filter((leg) => leg.status === LegStatus.COMPLETED)
      .sort((a, b) => b.sequence - a.sequence)[0];
    return completed ?? legs[0] ?? null;
  }
}
