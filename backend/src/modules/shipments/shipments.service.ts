import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryMode,
  EventVisibility,
  LegStatus,
  NotificationChannel,
  Prisma,
  ShipmentEventType,
  ShipmentStatus,
  ShipmentType,
} from '@prisma/client';
import { etiquetaDeDireccion } from '../customers/direccion-texto';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { firmarConClaves, firmarPodsDeParadas } from '../../storage/firmar-pod';
import { StorageService } from '../../storage/storage.service';
import { TrackingGateway } from '../realtime/tracking.gateway';
import { PaymentsService } from '../payments/payments.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';
import { SearchService } from '../search/search.service';
import { parseShipmentCsv } from './csv-import';
import { AddNoteDto } from './dto/add-note.dto';
import { registrar } from './eventos';
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
  // El historial de intentos cuelga del ENVÍO y no de la parada: el reintento
  // real es una parada nueva en otra ruta, así que verlo por parada mostraría
  // tres veces «intento 1» en tres pantallas distintas en vez de la secuencia.
  deliveryAttempts: { orderBy: { attemptNumber: 'asc' } },
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
          const entrega = await this.resolverEntrega(tx, dto);
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
              destinationCountry: dto.destinationCountry,
              weightKg: dto.weightKg,
              declaredValue: dto.declaredValue,
              codAmount: dto.codAmount,
              currency: dto.currency ?? 'USD',
              ...entrega,
            },
          });
          await registrar(tx, {
            tenantId,
            shipmentId: shipment.id,
            tipo: ShipmentEventType.STATUS_CHANGED,
            status: shipment.status,
            description: 'Envío creado',
            actorUserId: userId,
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

  /**
   * En qué montón va cada bulto al descargar (fase 5.3).
   *
   * La clasificación es una pregunta de bodega, no un informe: quien descarga
   * necesita saber cuántas cajas van a ruta, cuántas al mostrador de cada
   * sucursal y cuántas a puntos de terceros, ANTES de empezar a apilar. Por eso
   * cuenta lo que está en bodega o listo para salir, y no todo el histórico:
   * un envío entregado hace tres meses no se clasifica.
   *
   * Los estados que entran son los que describen «ya llegó y todavía no se
   * entregó». `FAILED_ATTEMPT` entra a propósito: un paquete que volvió a
   * bodega tras un intento fallido hay que volver a clasificarlo, y es
   * justamente el que más fácil se queda olvidado en un rincón.
   */
  async clasificacion(tenantId: string) {
    const enBodega: ShipmentStatus[] = [
      ShipmentStatus.IN_WAREHOUSE_HN,
      ShipmentStatus.CUSTOMS_CLEARED,
      ShipmentStatus.OUT_FOR_DELIVERY,
      ShipmentStatus.FAILED_ATTEMPT,
    ];

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [porModo, porSucursal] = await Promise.all([
        tx.shipment.groupBy({
          by: ['deliveryMode'],
          where: { status: { in: enBodega } },
          _count: { _all: true },
        }),
        tx.shipment.groupBy({
          by: ['deliveryWarehouseId'],
          where: {
            status: { in: enBodega },
            deliveryMode: DeliveryMode.BRANCH,
            deliveryWarehouseId: { not: null },
          },
          _count: { _all: true },
        }),
      ]);

      // Los nombres se resuelven en una sola consulta y no uno por grupo: son
      // pocas sucursales, pero una consulta por fila dentro de un `map` es
      // exactamente cómo una pantalla de bodega acaba tardando dos segundos.
      const ids = porSucursal
        .map((f) => f.deliveryWarehouseId)
        .filter((id): id is string => id !== null);
      const sucursales = await tx.warehouse.findMany({
        where: { id: { in: ids } },
        select: { id: true, code: true, name: true },
      });
      const porId = new Map(sucursales.map((s) => [s.id, s]));

      return {
        porModo: porModo.map((f) => ({
          modo: f.deliveryMode,
          envios: f._count._all,
        })),
        porSucursal: porSucursal
          .map((f) => ({
            warehouseId: f.deliveryWarehouseId,
            code: porId.get(f.deliveryWarehouseId!)?.code ?? null,
            name: porId.get(f.deliveryWarehouseId!)?.name ?? null,
            envios: f._count._all,
          }))
          .sort((a, b) => b.envios - a.envios),
      };
    });
  }

  /**
   * Resuelve el destino y el modo de entrega de un envío nuevo (fase 5.2/5.3).
   *
   * Hace dos cosas que no se pueden separar porque se contradicen entre sí: fija
   * a dónde va y comprueba que el cómo tenga sentido con el a dónde.
   */
  private async resolverEntrega(
    tx: Prisma.TransactionClient,
    dto: CreateShipmentDto,
  ) {
    const deliveryMode = dto.deliveryMode ?? DeliveryMode.HOME;

    // ---- El cómo -----------------------------------------------------------
    if (deliveryMode === DeliveryMode.BRANCH) {
      if (!dto.deliveryWarehouseId) {
        throw new BadRequestException(
          'Un envío que se retira en sucursal necesita decir en cuál.',
        );
      }
      const sucursal = await tx.warehouse.findUnique({
        where: { id: dto.deliveryWarehouseId },
        select: { id: true, active: true, allowsPickup: true, name: true },
      });
      if (!sucursal || !sucursal.active) {
        throw new NotFoundException('La sucursal de entrega no existe.');
      }
      // `allowsPickup` lo declaró la fase 2 justo para esto. Sin comprobarlo, un
      // envío puede quedar asignado a una bodega de tránsito donde no hay
      // mostrador ni nadie que atienda, y eso no se descubre hasta que el
      // cliente llega y se encuentra un portón.
      if (!sucursal.allowsPickup) {
        throw new BadRequestException(
          `«${sucursal.name}» no atiende retiro de clientes.`,
        );
      }
    } else if (dto.deliveryWarehouseId) {
      // Se rechaza en vez de ignorarlo en silencio: quien mandó la sucursal
      // creía estar diciendo algo, y un envío a domicilio con sucursal puesta
      // es justo la contradicción que después nadie sabe leer.
      throw new BadRequestException(
        'Sólo los envíos que se retiran en sucursal llevan sucursal de entrega.',
      );
    }

    // ---- El a dónde --------------------------------------------------------
    if (!dto.destinationAddressId) {
      return {
        deliveryMode,
        deliveryWarehouseId: dto.deliveryWarehouseId ?? null,
        destinationLabel: dto.destinationLabel,
        destinationLat: dto.destinationLat,
        destinationLng: dto.destinationLng,
      };
    }

    const direccion = await tx.customerAddress.findUnique({
      where: { id: dto.destinationAddressId },
    });
    if (!direccion || !direccion.active) {
      throw new NotFoundException('La dirección de destino no existe.');
    }
    // Una dirección es de un cliente. Aceptar la de otro dejaría el envío
    // apuntando a la casa de un tercero, y el enlace serviría además para
    // leerla desde el detalle del envío.
    if (dto.customerId && direccion.customerId !== dto.customerId) {
      throw new BadRequestException('Esa dirección es de otro cliente.');
    }

    return {
      deliveryMode,
      deliveryWarehouseId: dto.deliveryWarehouseId ?? null,
      destinationAddressId: direccion.id,
      // La COPIA congelada. Lo que se escriba aquí es lo que dirá este envío
      // dentro de dos años, aunque la dirección se corrija mañana. Lo que venga
      // explícito en el DTO manda sobre la dirección: quien lo mandó está
      // afinando este envío concreto, no la ficha del cliente.
      destinationLabel: dto.destinationLabel ?? etiquetaDeDireccion(direccion),
      destinationLat: dto.destinationLat ?? direccion.lat,
      destinationLng: dto.destinationLng ?? direccion.lng,
    };
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
      deliveryAttempts: await firmarConClaves(
        this.storage,
        shipment.deliveryAttempts,
        tenantId,
      ),
    };
  }

  /**
   * Escribe una nota en el historial del envío.
   *
   * No toca el estado ni nada más: es el único evento que existe solo para que
   * quede constancia de algo que no cabe en ningún tipo.
   */
  async addNote(user: AuthUser, id: string, dto: AddNoteDto) {
    const { tenantId, userId } = user;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!shipment) {
        throw new NotFoundException('Shipment not found');
      }
      await registrar(tx, {
        tenantId,
        shipmentId: id,
        tipo: ShipmentEventType.NOTE,
        description: dto.description,
        actorUserId: userId,
        visibility: dto.publica
          ? EventVisibility.PUBLIC
          : EventVisibility.INTERNAL,
      });
      return tx.shipment.findUniqueOrThrow({
        where: { id },
        include: shipmentDetail,
      });
    });
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
      await registrar(tx, {
        tenantId,
        shipmentId: id,
        tipo: ShipmentEventType.STATUS_CHANGED,
        status: dto.status,
        legId: dto.legId,
        description: dto.description,
        locationLabel: dto.locationLabel,
        lat: dto.lat,
        lng: dto.lng,
        actorUserId: userId,
        // De dónde venía. Sin esto, reconstruir el recorrido obliga a leer la
        // fila anterior y confiar en que el orden por fecha no engañe.
        metadata: { from: fromStatus ?? null, to: dto.status },
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
