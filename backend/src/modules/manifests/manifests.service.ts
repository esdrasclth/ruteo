import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ManifestStatus, Prisma } from '@prisma/client';
import { saltar } from '../../common/dto/paginacion.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { cotejar, diferenciaDeTotales } from './cotejo';
import { AddManifestItemDto } from './dto/add-item.dto';
import { CreateManifestDto } from './dto/create-manifest.dto';
import { QueryManifestsDto } from './dto/query-manifests.dto';
import { ReconcileManifestDto } from './dto/reconcile.dto';
import { UpdateManifestDto } from './dto/update-manifest.dto';

/**
 * Manifiestos de carga: la guía madre y sus guías hijas.
 *
 * Esto es lo que faltaba para que «consolidación» dejara de significar dos
 * cosas. Juntar tres paquetes de un cliente en un envío ya existía
 * (`ConsolidationService`); agrupar ciento cincuenta bultos de todos los
 * clientes en el vuelo del martes es esto, y va un nivel por encima.
 */
@Injectable()
export class ManifestsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly detalle = {
    trip: {
      include: {
        carrier: { select: { id: true, name: true } },
        origin: { select: { id: true, code: true, name: true } },
        destination: { select: { id: true, code: true, name: true } },
      },
    },
    items: {
      orderBy: { createdAt: 'asc' },
      include: {
        shipment: { select: { id: true, trackingNumber: true, status: true } },
      },
    },
    exceptions: { orderBy: { createdAt: 'desc' } },
  } satisfies Prisma.ManifestInclude;

  async create(tenantId: string, dto: CreateManifestDto) {
    try {
      return await this.prisma.withTenant(tenantId, (tx) =>
        tx.manifest.create({
          data: { tenantId, number: dto.number, tripId: dto.tripId },
          include: this.detalle,
        }),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          `Ya existe un manifiesto con el número ${dto.number}`,
        );
      }
      throw error;
    }
  }

  async list(tenantId: string, query: QueryManifestsDto) {
    const where: Prisma.ManifestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.tripId ? { tripId: query.tripId } : {}),
    };
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [total, items] = await Promise.all([
        tx.manifest.count({ where }),
        tx.manifest.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: saltar(query),
          take: query.pageSize,
          include: {
            trip: { select: { id: true, flightNumber: true } },
            _count: { select: { items: true, exceptions: true } },
          },
        }),
      ]);
      return { items, total, page: query.page, pageSize: query.pageSize };
    });
  }

  async findOne(tenantId: string, id: string) {
    const manifiesto = await this.prisma.withTenant(tenantId, (tx) =>
      tx.manifest.findUnique({ where: { id }, include: this.detalle }),
    );
    if (!manifiesto) throw new NotFoundException('El manifiesto no existe');
    return manifiesto;
  }

  /**
   * Engancha (o desengancha) el manifiesto a un vuelo.
   *
   * Se permite incluso con el manifiesto ya transmitido, y es deliberado:
   * asignar vuelo no cambia la mercancía declarada —ni bultos, ni pesos, ni
   * consignatarios—, y en la práctica el vuelo se confirma o se cambia después
   * de armar el documento. Lo que sí queda cerrado tras transmitir son las
   * guías, que es lo que hace de esto un documento.
   *
   * Cotejado sí se bloquea: a esas alturas el viaje ya ocurrió, y cambiarlo
   * reescribiría la historia de una carga que ya se contó.
   */
  async update(tenantId: string, id: string, dto: UpdateManifestDto) {
    const actual = await this.prisma.withTenant(tenantId, (tx) =>
      tx.manifest.findUnique({ where: { id }, select: { status: true } }),
    );
    if (!actual) throw new NotFoundException('El manifiesto no existe');
    if (actual.status === ManifestStatus.RECONCILED) {
      throw new BadRequestException(
        'El manifiesto ya se cotejó: el viaje ocurrió y no se puede cambiar.',
      );
    }

    if (dto.tripId) {
      const viaje = await this.prisma.withTenant(tenantId, (tx) =>
        tx.trip.findUnique({ where: { id: dto.tripId! }, select: { id: true } }),
      );
      if (!viaje) throw new NotFoundException('El viaje no existe');
    }

    return this.prisma.withTenant(tenantId, (tx) =>
      tx.manifest.update({
        where: { id },
        data: { tripId: dto.tripId ?? null },
        include: this.detalle,
      }),
    );
  }

  /**
   * Añade una guía hija.
   *
   * Los datos se COPIAN del envío en vez de leerse por relación: el manifiesto
   * es un documento y tiene que seguir diciendo lo que decía el día que se
   * transmitió, aunque el envío cambie después. Si mañana se corrige el peso de
   * un envío, la aduana no debe ver un manifiesto distinto del que recibió.
   */
  async addItem(tenantId: string, manifestId: string, dto: AddManifestItemDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const manifiesto = await tx.manifest.findUnique({
        where: { id: manifestId },
        select: { id: true, status: true },
      });
      if (!manifiesto) throw new NotFoundException('El manifiesto no existe');
      this.exigirBorrador(manifiesto.status);

      const envio = await tx.shipment.findUnique({
        where: { id: dto.shipmentId },
        select: {
          id: true,
          trackingNumber: true,
          recipientName: true,
          weightKg: true,
          declaredValue: true,
          currency: true,
        },
      });
      if (!envio) throw new NotFoundException('El envío no existe');

      try {
        return await tx.manifestItem.create({
          data: {
            tenantId,
            manifestId,
            shipmentId: envio.id,
            pieces: dto.pieces ?? 1,
            weightKg: dto.weightKg ?? envio.weightKg ?? 0,
            description: dto.description,
            consignee: dto.consignee ?? envio.recipientName,
            freightAmount: dto.freightAmount,
            fobValue: dto.fobValue ?? envio.declaredValue,
            currency: dto.currency ?? envio.currency,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new BadRequestException(
            `El envío ${envio.trackingNumber} ya está en este manifiesto`,
          );
        }
        throw error;
      }
    });
  }

  async removeItem(tenantId: string, manifestId: string, itemId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const manifiesto = await tx.manifest.findUnique({
        where: { id: manifestId },
        select: { status: true },
      });
      if (!manifiesto) throw new NotFoundException('El manifiesto no existe');
      this.exigirBorrador(manifiesto.status);
      await tx.manifestItem.deleteMany({ where: { id: itemId, manifestId } });
      return { ok: true };
    });
  }

  /**
   * Cierra el manifiesto y congela los totales declarados.
   *
   * Se congelan y no se calculan al leer porque son lo que se transmitió:
   * recalcularlos haría que añadir una línea después cambiara retroactivamente
   * lo que se declaró, y el cotejo compararía contra un número que nadie envió.
   */
  async transmit(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const manifiesto = await tx.manifest.findUnique({
        where: { id },
        select: { status: true, items: { select: { pieces: true, weightKg: true } } },
      });
      if (!manifiesto) throw new NotFoundException('El manifiesto no existe');
      this.exigirBorrador(manifiesto.status);
      if (manifiesto.items.length === 0) {
        throw new BadRequestException(
          'Un manifiesto sin guías no se puede transmitir.',
        );
      }

      const totalPieces = manifiesto.items.reduce((n, i) => n + i.pieces, 0);
      const totalWeightKg = manifiesto.items.reduce(
        (s, i) => s.plus(i.weightKg),
        new Prisma.Decimal(0),
      );

      return tx.manifest.update({
        where: { id },
        data: { status: ManifestStatus.TRANSMITTED, totalPieces, totalWeightKg },
        include: this.detalle,
      });
    });
  }

  /**
   * Cotejo a la llegada: lo declarado contra lo contado.
   *
   * Cada diferencia se convierte en una `Exception` con su valor esperado y su
   * valor real. No se anota en una nota de texto porque una nota no se puede
   * contar, ni asignar, ni cerrar, y lo primero que se pregunta a fin de mes es
   * cuántos faltantes hubo.
   *
   * Todo va en UNA transacción: si se crearan las excepciones aparte y algo
   * fallara, quedaría un manifiesto marcado como cotejado y sin rastro de las
   * diferencias que se encontraron, que es la peor combinación posible.
   */
  async reconcile(
    tenantId: string,
    id: string,
    dto: ReconcileManifestDto,
    userId?: string,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const manifiesto = await tx.manifest.findUnique({
        where: { id },
        include: {
          items: {
            select: {
              id: true,
              shipmentId: true,
              pieces: true,
              weightKg: true,
              shipment: { select: { trackingNumber: true } },
            },
          },
        },
      });
      if (!manifiesto) throw new NotFoundException('El manifiesto no existe');
      if (manifiesto.status === ManifestStatus.DRAFT) {
        throw new BadRequestException(
          'Un manifiesto en borrador todavía no se ha transmitido: no hay nada declarado contra lo que cotejar.',
        );
      }

      // Todo lo contado tiene que ser un envío REAL de esta empresa. Un
      // identificador que no existe reventaría la clave foránea al crear la
      // excepción y tumbaría el cotejo entero —incluidas las diferencias que sí
      // se detectaron— con un error de base de datos que no explica nada.
      const contados = dto.items.map((i) => i.shipmentId);
      const existentes = await tx.shipment.findMany({
        where: { id: { in: contados } },
        select: { id: true },
      });
      if (existentes.length !== new Set(contados).size) {
        const conocidos = new Set(existentes.map((e) => e.id));
        const desconocidos = contados.filter((id) => !conocidos.has(id));
        throw new BadRequestException(
          `Se contaron envíos que no existen: ${desconocidos.join(', ')}. ` +
            'Un bulto sin envío en el sistema hay que darlo de alta antes de cotejarlo.',
        );
      }

      const resultado = cotejar(
        manifiesto.items.map((i) => ({
          shipmentId: i.shipmentId,
          trackingNumber: i.shipment.trackingNumber,
          pieces: i.pieces,
          weightKg: i.weightKg,
        })),
        dto.items,
      );

      // El conteo por línea se guarda aunque cuadre: es la prueba de que se
      // contó. Sin él no se distingue «se revisó y estaba bien» de «nadie miró».
      for (const contada of dto.items) {
        await tx.manifestItem.updateMany({
          where: { manifestId: id, shipmentId: contada.shipmentId },
          data: {
            receivedPieces: contada.receivedPieces,
            receivedWeightKg: contada.receivedWeightKg,
          },
        });
      }

      const totales = diferenciaDeTotales(
        manifiesto.totalPieces,
        manifiesto.totalWeightKg,
        resultado,
      );

      const excepciones = [
        ...resultado.diferencias.map((d) => ({
          tenantId,
          manifestId: id,
          shipmentId: d.shipmentId,
          type: d.type,
          severity: d.severity,
          description: d.description,
          expectedValue: d.expectedValue,
          actualValue: d.actualValue,
          createdByUserId: userId,
        })),
        ...(totales
          ? [
              {
                tenantId,
                manifestId: id,
                type: totales.type,
                severity: totales.severity,
                description: totales.description,
                expectedValue: totales.expectedValue,
                actualValue: totales.actualValue,
                createdByUserId: userId,
              },
            ]
          : []),
      ];

      if (excepciones.length > 0) {
        await tx.exception.createMany({ data: excepciones });
      }

      await tx.manifest.update({
        where: { id },
        data: {
          status: ManifestStatus.RECONCILED,
          receivedPieces: resultado.receivedPieces,
          receivedWeightKg: resultado.receivedWeightKg,
          reconciledAt: new Date(),
        },
      });

      return {
        cuadra: resultado.cuadra && !totales,
        receivedPieces: resultado.receivedPieces,
        receivedWeightKg: resultado.receivedWeightKg,
        excepcionesCreadas: excepciones.length,
      };
    });
  }

  private exigirBorrador(status: ManifestStatus) {
    if (status !== ManifestStatus.DRAFT) {
      throw new BadRequestException(
        'El manifiesto ya se transmitió: sus guías no se pueden cambiar. ' +
          'Un documento que se modifica después de enviarlo deja de valer como documento.',
      );
    }
  }
}
