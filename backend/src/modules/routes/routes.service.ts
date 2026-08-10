import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  RouteStatus,
  ShipmentStatus,
  ShipmentType,
  StopStatus,
  StopType,
} from '@prisma/client';
import { nearestNeighbourOrder } from '../../common/geo';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { saltar } from '../../common/dto/paginacion.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { canTransition } from '../shipments/shipment-status';
import { ShipmentsService } from '../shipments/shipments.service';
import { AddStopDto } from './dto/add-stop.dto';
import { CompleteStopDto } from './dto/complete-stop.dto';
import { CreateRouteDto } from './dto/create-route.dto';
import { FailStopDto } from './dto/fail-stop.dto';
import { OptimizeRouteDto } from './dto/optimize-route.dto';
import { QueryRoutesDto } from './dto/query-routes.dto';
import { UpdateRouteStatusDto } from './dto/update-route-status.dto';
import { generateRouteCode } from './route-code';

const routeDetail = {
  driver: true,
  stops: {
    orderBy: { sequence: 'asc' },
    include: {
      shipment: { select: { trackingNumber: true, status: true } },
      pod: true,
    },
  },
} satisfies Prisma.RouteInclude;

@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shipments: ShipmentsService,
  ) {}

  async create(tenantId: string, dto: CreateRouteDto) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = dto.code ?? generateRouteCode();
      try {
        return await this.prisma.withTenant(tenantId, async (tx) => {
          const driver = await tx.driver.findUnique({
            where: { id: dto.driverId },
            select: { id: true },
          });
          if (!driver) {
            throw new NotFoundException('Driver not found');
          }
          return tx.route.create({
            data: {
              tenantId,
              driverId: dto.driverId,
              code,
              scheduledDate: new Date(dto.scheduledDate),
            },
            include: routeDetail,
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          if (dto.code) {
            throw new BadRequestException(
              `Route code "${dto.code}" already exists`,
            );
          }
          continue; // generated code collision, retry
        }
        throw error;
      }
    }
    throw new BadRequestException('Could not allocate a route code');
  }

  // Paginado: se crea al menos una ruta por repartidor y día, así que el
  // histórico crece sin parar aunque la operación diaria sea pequeña.
  async list(tenantId: string, query: QueryRoutesDto) {
    const where: Prisma.RouteWhereInput = {
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [total, items] = await Promise.all([
        tx.route.count({ where }),
        tx.route.findMany({
          where,
          orderBy: { scheduledDate: 'desc' },
          skip: saltar(query),
          take: query.pageSize,
          include: { driver: true, _count: { select: { stops: true } } },
        }),
      ]);
      return { items, total, page: query.page, pageSize: query.pageSize };
    });
  }

  async findOne(tenantId: string, id: string) {
    const route = await this.prisma.withTenant(tenantId, (tx) =>
      tx.route.findUnique({ where: { id }, include: routeDetail }),
    );
    if (!route) {
      throw new NotFoundException('Route not found');
    }
    return route;
  }

  async updateStatus(tenantId: string, id: string, dto: UpdateRouteStatusDto) {
    await this.ensureExists(tenantId, id);
    const timestamps: Prisma.RouteUpdateInput = {};
    if (dto.status === RouteStatus.IN_PROGRESS) {
      timestamps.startedAt = new Date();
    }
    if (dto.status === RouteStatus.COMPLETED) {
      timestamps.completedAt = new Date();
    }
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.route.update({
        where: { id },
        data: { status: dto.status, ...timestamps },
        include: routeDetail,
      }),
    );
  }

  async addStop(tenantId: string, routeId: string, dto: AddStopDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const route = await tx.route.findUnique({
        where: { id: routeId },
        select: { id: true },
      });
      if (!route) {
        throw new NotFoundException('Route not found');
      }
      const shipment = await tx.shipment.findUnique({
        where: { id: dto.shipmentId },
        select: { id: true, destinationLat: true, destinationLng: true },
      });
      if (!shipment) {
        throw new NotFoundException('Shipment not found');
      }

      const last = await tx.routeStop.findFirst({
        where: { routeId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      const type = dto.type ?? StopType.DELIVERY;

      return tx.routeStop.create({
        data: {
          tenantId,
          routeId,
          shipmentId: dto.shipmentId,
          sequence: (last?.sequence ?? 0) + 1,
          type,
          addressLabel: dto.addressLabel,
          lat: dto.lat ?? shipment.destinationLat,
          lng: dto.lng ?? shipment.destinationLng,
          notes: dto.notes,
        },
      });
    });
  }

  // Reorders stops with coordinates by nearest-neighbour from a start point
  // (provided, else the driver's zone center). Stops without coordinates keep
  // their relative order at the end.
  async optimize(tenantId: string, routeId: string, dto: OptimizeRouteDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const route = await tx.route.findUnique({
        where: { id: routeId },
        include: {
          driver: { include: { zone: true } },
          stops: { orderBy: { sequence: 'asc' } },
        },
      });
      if (!route) {
        throw new NotFoundException('Route not found');
      }

      const geoStops = route.stops.filter(
        (s): s is typeof s & { lat: number; lng: number } =>
          s.lat !== null && s.lng !== null,
      );
      const flatStops = route.stops.filter(
        (s) => s.lat === null || s.lng === null,
      );

      const start = {
        lat: dto.startLat ?? route.driver.zone?.centerLat ?? geoStops[0]?.lat,
        lng: dto.startLng ?? route.driver.zone?.centerLng ?? geoStops[0]?.lng,
      };
      if (geoStops.length < 2 || start.lat == null || start.lng == null) {
        throw new BadRequestException(
          'Need at least 2 stops with coordinates and a start point to optimize',
        );
      }

      const order = nearestNeighbourOrder({ lat: start.lat, lng: start.lng }, geoStops);
      const ordered = [
        ...order.map((i) => geoStops[i]),
        ...flatStops,
      ];

      // Two-pass to avoid colliding with the unique [routeId, sequence] index.
      await Promise.all(
        ordered.map((stop, idx) =>
          tx.routeStop.update({
            where: { id: stop.id },
            data: { sequence: idx + 1 + 1000 },
          }),
        ),
      );
      await Promise.all(
        ordered.map((stop, idx) =>
          tx.routeStop.update({
            where: { id: stop.id },
            data: { sequence: idx + 1 },
          }),
        ),
      );

      return tx.route.findUniqueOrThrow({
        where: { id: routeId },
        include: routeDetail,
      });
    });
  }

  async arriveStop(tenantId: string, routeId: string, stopId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const stop = await this.loadStop(tx, routeId, stopId);
      if (stop.status !== StopStatus.PENDING) {
        throw new BadRequestException(`Stop is already ${stop.status}`);
      }
      return tx.routeStop.update({
        where: { id: stopId },
        data: { status: StopStatus.ARRIVED, arrivedAt: new Date() },
      });
    });
  }

  async completeStop(
    user: AuthUser,
    routeId: string,
    stopId: string,
    dto: CompleteStopDto,
  ) {
    const { tenantId } = user;
    const info = await this.prisma.withTenant(tenantId, async (tx) => {
      const stop = await this.loadStop(tx, routeId, stopId);
      this.assertNotFinal(stop.status);
      await tx.routeStop.update({
        where: { id: stopId },
        data: {
          status: StopStatus.COMPLETED,
          completedAt: new Date(),
          arrivedAt: stop.arrivedAt ?? new Date(),
        },
      });
      await tx.proofOfDelivery.upsert({
        where: { routeStopId: stopId },
        create: {
          tenantId,
          shipmentId: stop.shipmentId,
          routeStopId: stopId,
          receivedBy: dto.receivedBy,
          signatureUrl: dto.signatureUrl,
          photoUrl: dto.photoUrl,
          lat: dto.lat,
          lng: dto.lng,
        },
        update: {
          receivedBy: dto.receivedBy,
          signatureUrl: dto.signatureUrl,
          photoUrl: dto.photoUrl,
          lat: dto.lat,
          lng: dto.lng,
          failureReason: null,
        },
      });
      return { shipment: stop.shipment, type: stop.type };
    });

    const target =
      info.type === StopType.PICKUP
        ? ShipmentStatus.PICKED_UP
        : ShipmentStatus.DELIVERED;
    await this.advanceShipment(user, info.shipment, target, dto.lat, dto.lng);

    return this.findOne(tenantId, routeId);
  }

  async failStop(
    user: AuthUser,
    routeId: string,
    stopId: string,
    dto: FailStopDto,
  ) {
    const { tenantId } = user;
    const info = await this.prisma.withTenant(tenantId, async (tx) => {
      const stop = await this.loadStop(tx, routeId, stopId);
      this.assertNotFinal(stop.status);
      await tx.routeStop.update({
        where: { id: stopId },
        data: {
          status: StopStatus.FAILED,
          completedAt: new Date(),
          arrivedAt: stop.arrivedAt ?? new Date(),
        },
      });
      await tx.proofOfDelivery.upsert({
        where: { routeStopId: stopId },
        create: {
          tenantId,
          shipmentId: stop.shipmentId,
          routeStopId: stopId,
          failureReason: dto.failureReason,
          lat: dto.lat,
          lng: dto.lng,
        },
        update: {
          failureReason: dto.failureReason,
          lat: dto.lat,
          lng: dto.lng,
        },
      });
      return { shipment: stop.shipment };
    });

    await this.advanceShipment(
      user,
      info.shipment,
      ShipmentStatus.FAILED_ATTEMPT,
      dto.lat,
      dto.lng,
      dto.failureReason,
    );

    return this.findOne(tenantId, routeId);
  }

  private async advanceShipment(
    user: AuthUser,
    shipment: { id: string; type: ShipmentType; status: ShipmentStatus },
    target: ShipmentStatus,
    lat?: number,
    lng?: number,
    description?: string,
  ) {
    if (!canTransition(shipment.type, shipment.status, target)) {
      return; // shipment not in a state this stop can advance; leave it as-is
    }
    await this.shipments.updateStatus(user, shipment.id, {
      status: target,
      description: description ?? `Stop ${target.toLowerCase()}`,
      lat,
      lng,
    });
  }

  private loadStop(
    tx: Prisma.TransactionClient,
    routeId: string,
    stopId: string,
  ) {
    return tx.routeStop
      .findFirst({
        where: { id: stopId, routeId },
        include: {
          shipment: { select: { id: true, type: true, status: true } },
        },
      })
      .then((stop) => {
        if (!stop) {
          throw new NotFoundException('Stop not found');
        }
        return stop;
      });
  }

  private assertNotFinal(status: StopStatus) {
    if (status === StopStatus.COMPLETED || status === StopStatus.FAILED) {
      throw new BadRequestException(`Stop is already ${status}`);
    }
  }

  private async ensureExists(tenantId: string, id: string) {
    const route = await this.prisma.withTenant(tenantId, (tx) =>
      tx.route.findUnique({ where: { id }, select: { id: true } }),
    );
    if (!route) {
      throw new NotFoundException('Route not found');
    }
  }
}
