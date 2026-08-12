import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LegStatus,
  NotificationChannel,
  Prisma,
  ShipmentStatus,
  ShipmentType,
} from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { firmarPodsDeParadas } from '../../storage/firmar-pod';
import { StorageService } from '../../storage/storage.service';
import { TrackingGateway } from '../realtime/tracking.gateway';
import { PaymentsService } from '../payments/payments.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';
import { SearchService } from '../search/search.service';
import { parseShipmentCsv } from './csv-import';
import { CreateLegDto } from './dto/create-leg.dto';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { QueryShipmentsDto } from './dto/query-shipments.dto';
import { UpdateLegDto } from './dto/update-leg.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { buildLabelSvg } from './label';
import { legStatusMessage } from './leg-message';
import { canTransition } from './shipment-status';
import { statusMessage } from './status-message';
import { generateTrackingNumber } from './tracking-number';

// El detalle del envío es el punto donde converge toda la operación, así que
// trae también su contexto: quién lo recibe, en qué ruta va, qué se le cobró y
// qué se le avisó. Sin esto el panel obliga a saltar entre módulos a mano.
const shipmentDetail = {
  legs: { orderBy: { sequence: 'asc' } },
  events: { orderBy: { occurredAt: 'asc' } },
  customer: { select: { id: true, name: true, email: true, phone: true } },
  customs: true,
  routeStops: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      sequence: true,
      type: true,
      status: true,
      arrivedAt: true,
      completedAt: true,
      route: {
        select: {
          id: true,
          code: true,
          status: true,
          scheduledDate: true,
          driver: { select: { id: true, name: true, phone: true } },
        },
      },
      pod: true,
    },
  },
  payments: { orderBy: { createdAt: 'desc' } },
  notifications: {
    orderBy: { createdAt: 'desc' },
    take: 20,
  },
  packages: {
    select: {
      id: true,
      externalTracking: true,
      merchant: true,
      description: true,
      weightKg: true,
      status: true,
      locker: { select: { id: true, code: true } },
    },
  },
} satisfies Prisma.ShipmentInclude;

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TrackingGateway,
    private readonly config: ConfigService,
    private readonly payments: PaymentsService,
    private readonly webhooks: WebhooksService,
    private readonly notifications: NotificationsService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly search: SearchService,
  ) {}

  async create(user: AuthUser, dto: CreateShipmentDto) {
    const { tenantId, userId } = user;
    await this.billing.assertShipmentQuota(tenantId);
    for (let attempt = 0; attempt < 3; attempt++) {
      const trackingNumber = generateTrackingNumber();
      try {
        return await this.prisma.withTenant(tenantId, async (tx) => {
          const shipment = await tx.shipment.create({
            data: {
              tenantId,
              customerId: dto.customerId,
              trackingNumber,
              type: dto.type,
              recipientName: dto.recipientName,
              recipientPhone: dto.recipientPhone,
              originLabel: dto.originLabel,
              originCountry: dto.originCountry,
              destinationLabel: dto.destinationLabel,
              destinationCountry: dto.destinationCountry,
              destinationLat: dto.destinationLat,
              destinationLng: dto.destinationLng,
              weightKg: dto.weightKg,
              declaredValue: dto.declaredValue,
              codAmount: dto.codAmount,
              currency: dto.currency ?? 'USD',
            },
          });
          await tx.shipmentEvent.create({
            data: {
              tenantId,
              shipmentId: shipment.id,
              status: shipment.status,
              description: 'Shipment created',
              createdByUserId: userId,
            },
          });
          await this.payments.createCodInTx(tx, tenantId, shipment);
          return tx.shipment.findUniqueOrThrow({
            where: { id: shipment.id },
            include: shipmentDetail,
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue; // tracking number collision, retry
        }
        throw error;
      }
    }
    throw new BadRequestException('Could not allocate a tracking number');
  }

  // Bulk-creates shipments from a CSV file. Valid rows are inserted; invalid
  // rows are skipped and reported so the caller can fix and re-upload them.
  async importCsv(user: AuthUser, content: string) {
    // `parseShipmentCsv` lanza `Error` a secas cuando el archivo no se puede
    // leer o trae más filas de la cuenta. Sin esto sale un 500, y el usuario
    // —que solo subió un CSV mal formado— ve un fallo del servidor en vez del
    // motivo, que además es accionable ("pártelo en varios archivos").
    let parsed: ReturnType<typeof parseShipmentCsv>;
    try {
      parsed = parseShipmentCsv(content);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'CSV inválido',
      );
    }

    const { valid, invalid } = parsed;
    if (valid.length === 0 && invalid.length === 0) {
      throw new BadRequestException('CSV has no data rows');
    }

    const created: { line: number; id: string; trackingNumber: string }[] = [];
    const errors = [...invalid];
    for (const row of valid) {
      try {
        const shipment = await this.create(user, row.dto);
        created.push({
          line: row.line,
          id: shipment.id,
          trackingNumber: shipment.trackingNumber,
        });
      } catch (err) {
        if (err instanceof ForbiddenException) {
          // Plan quota reached; remaining rows would fail too, so stop.
          errors.push({ line: row.line, errors: [err.message] });
          break;
        }
        throw err;
      }
    }

    return {
      createdCount: created.length,
      failedCount: errors.length,
      created,
      errors,
    };
  }

  async buildLabel(tenantId: string, id: string) {
    const data = await this.prisma.withTenant(tenantId, async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id },
        select: {
          trackingNumber: true,
          recipientName: true,
          recipientPhone: true,
          destinationLabel: true,
          destinationCountry: true,
          weightKg: true,
          codAmount: true,
          currency: true,
        },
      });
      if (!shipment) {
        throw new NotFoundException('Shipment not found');
      }
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });
      return { shipment, tenantName: tenant?.name ?? null };
    });

    const base = this.config.get<string>(
      'PUBLIC_APP_URL',
      'http://localhost:3000',
    );
    const num = (v: unknown) => (v == null ? null : Number(v));

    return buildLabelSvg({
      trackingNumber: data.shipment.trackingNumber,
      recipientName: data.shipment.recipientName,
      recipientPhone: data.shipment.recipientPhone,
      destinationLabel: data.shipment.destinationLabel,
      destinationCountry: data.shipment.destinationCountry,
      weightKg: num(data.shipment.weightKg),
      codAmount: num(data.shipment.codAmount),
      currency: data.shipment.currency,
      tenantName: data.tenantName,
      trackingUrl: `${base}/api/tracking/${data.shipment.trackingNumber}`,
    });
  }

  async list(tenantId: string, query: QueryShipmentsDto) {
    const search = query.search?.trim();
    return this.prisma.withTenant(tenantId, async (tx) => {
      // El texto se resuelve con `unaccent` (igual que la busqueda global) y
      // luego se pagina sobre esos ids: asi "lopez" encuentra "Lopez" con
      // tilde, cosa que `mode: 'insensitive'` no hace.
      const idsPorTexto = search
        ? await this.search.shipmentIdsMatching(tx, search)
        : null;

      const where: Prisma.ShipmentWhereInput = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(idsPorTexto ? { id: { in: idsPorTexto } } : {}),
      };

      const [total, items] = await Promise.all([
        tx.shipment.count({ where }),
        tx.shipment.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      return {
        items,
        total,
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  async findOne(tenantId: string, id: string) {
    const shipment = await this.prisma.withTenant(tenantId, (tx) =>
      tx.shipment.findUnique({ where: { id }, include: shipmentDetail }),
    );
    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }
    // El detalle del envío muestra la prueba de entrega igual que la ruta, así
    // que la evidencia hay que firmarla aquí también. Si esto se olvidara, la
    // misma foto se vería desde la ruta y no desde el envío.
    return {
      ...shipment,
      routeStops: await firmarPodsDeParadas(
        this.storage,
        shipment.routeStops,
        tenantId,
      ),
    };
  }

  async updateStatus(user: AuthUser, id: string, dto: UpdateStatusDto) {
    const { tenantId, userId } = user;
    let fromStatus: ShipmentStatus | undefined;
    const result = await this.prisma.withTenant(tenantId, async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id },
        select: { id: true, type: true, status: true },
      });
      if (!shipment) {
        throw new NotFoundException('Shipment not found');
      }
      fromStatus = shipment.status;
      if (
        shipment.status !== dto.status &&
        !canTransition(shipment.type, shipment.status, dto.status)
      ) {
        throw new BadRequestException(
          `Invalid transition from ${shipment.status} to ${dto.status}`,
        );
      }
      if (dto.legId) {
        const leg = await tx.shipmentLeg.findFirst({
          where: { id: dto.legId, shipmentId: id },
          select: { id: true },
        });
        if (!leg) {
          throw new BadRequestException('Leg does not belong to this shipment');
        }
      }
      await tx.shipment.update({
        where: { id },
        data: { status: dto.status },
      });
      await tx.shipmentEvent.create({
        data: {
          tenantId,
          shipmentId: id,
          legId: dto.legId,
          status: dto.status,
          description: dto.description,
          locationLabel: dto.locationLabel,
          lat: dto.lat,
          lng: dto.lng,
          createdByUserId: userId,
        },
      });
      if (dto.status === ShipmentStatus.DELIVERED) {
        await this.payments.collectForShipmentInTx(tx, id);
      }
      return tx.shipment.findUniqueOrThrow({
        where: { id },
        include: shipmentDetail,
      });
    });

    this.gateway.emitShipmentUpdate(result.trackingNumber, {
      trackingNumber: result.trackingNumber,
      status: result.status,
      updatedAt: result.updatedAt,
    });
    this.webhooks.dispatch(tenantId, 'shipment.status_changed', {
      id: result.id,
      trackingNumber: result.trackingNumber,
      status: result.status,
      updatedAt: result.updatedAt,
    });
    if (result.recipientPhone) {
      this.notifications.dispatch(tenantId, {
        channel: NotificationChannel.SMS,
        recipient: result.recipientPhone,
        type: 'shipment.status_changed',
        title: `Envío ${result.trackingNumber}`,
        body: statusMessage(result.trackingNumber, result.status),
        shipmentId: result.id,
      });
    }
    this.audit.dispatch(tenantId, {
      action: 'shipment.status_changed',
      entityType: 'shipment',
      entityId: result.id,
      actor: { userId, role: user.role },
      metadata: {
        trackingNumber: result.trackingNumber,
        from: fromStatus ?? null,
        to: result.status,
      },
    });
    return result;
  }

  async addLeg(tenantId: string, shipmentId: string, dto: CreateLegDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
        select: { id: true, type: true },
      });
      if (!shipment) {
        throw new NotFoundException('Shipment not found');
      }
      if (shipment.type !== ShipmentType.INTERNATIONAL) {
        throw new BadRequestException(
          'Legs are only supported for international shipments',
        );
      }
      try {
        return await tx.shipmentLeg.create({
          data: {
            tenantId,
            shipmentId,
            sequence: dto.sequence,
            mode: dto.mode,
            originLabel: dto.originLabel,
            destinationLabel: dto.destinationLabel,
            originLat: dto.originLat,
            originLng: dto.originLng,
            destinationLat: dto.destinationLat,
            destinationLng: dto.destinationLng,
            carrier: dto.carrier,
            carrierId: dto.carrierId,
            externalTracking: dto.externalTracking,
            etaAt: dto.etaAt ? new Date(dto.etaAt) : undefined,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new BadRequestException(
            `Leg sequence ${dto.sequence} already exists`,
          );
        }
        throw error;
      }
    });
  }

  async updateLeg(
    tenantId: string,
    shipmentId: string,
    legId: string,
    dto: UpdateLegDto,
  ) {
    const { updated, previousStatus, shipment } = await this.prisma.withTenant(
      tenantId,
      async (tx) => {
        const leg = await tx.shipmentLeg.findFirst({
          where: { id: legId, shipmentId },
          select: { id: true, status: true },
        });
        if (!leg) {
          throw new NotFoundException('Leg not found');
        }
        const shipment = await tx.shipment.findUniqueOrThrow({
          where: { id: shipmentId },
          select: { trackingNumber: true, recipientPhone: true },
        });
        const updated = await tx.shipmentLeg.update({
          where: { id: legId },
          data: {
            status: dto.status,
            originLat: dto.originLat,
            originLng: dto.originLng,
            destinationLat: dto.destinationLat,
            destinationLng: dto.destinationLng,
            carrier: dto.carrier,
            carrierId: dto.carrierId,
            externalTracking: dto.externalTracking,
            etaAt: dto.etaAt ? new Date(dto.etaAt) : undefined,
            departedAt: dto.departedAt ? new Date(dto.departedAt) : undefined,
            arrivedAt: dto.arrivedAt ? new Date(dto.arrivedAt) : undefined,
          },
        });
        return { updated, previousStatus: leg.status, shipment };
      },
    );

    const milestoneReached =
      dto.status != null &&
      dto.status !== previousStatus &&
      (dto.status === LegStatus.IN_PROGRESS ||
        dto.status === LegStatus.COMPLETED);
    if (milestoneReached && shipment.recipientPhone) {
      this.notifications.dispatch(tenantId, {
        channel: NotificationChannel.SMS,
        recipient: shipment.recipientPhone,
        type: 'shipment.leg_updated',
        title: `Envío ${shipment.trackingNumber}`,
        body: legStatusMessage(
          shipment.trackingNumber,
          updated.status,
          updated,
        ),
        shipmentId,
      });
    }
    return updated;
  }

  // Borrar un tramo es corregir un error de captura, no un hecho del negocio:
  // no emite notificación ni evento, a diferencia de `updateLeg`.
  async removeLeg(tenantId: string, shipmentId: string, legId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // findFirst acotado por shipmentId: evita borrar un tramo de otro envío
      // pasando un legId ajeno, aunque RLS ya limite al tenant.
      const leg = await tx.shipmentLeg.findFirst({
        where: { id: legId, shipmentId },
        select: { id: true },
      });
      if (!leg) {
        throw new NotFoundException('Tramo no encontrado');
      }
      await tx.shipmentLeg.delete({ where: { id: legId } });
      return { deleted: true };
    });
  }
}
