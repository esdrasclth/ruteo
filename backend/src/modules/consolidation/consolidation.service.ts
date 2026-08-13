import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PackageStatus,
  Prisma,
  ShipmentEventType,
  ShipmentStatus,
  ShipmentType,
} from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { registrar } from '../shipments/eventos';
import { generateTrackingNumber } from '../shipments/tracking-number';

const shipmentDetail = {
  legs: { orderBy: { sequence: 'asc' } },
  events: { orderBy: { occurredAt: 'asc' } },
  packages: true,
} satisfies Prisma.ShipmentInclude;

@Injectable()
export class ConsolidationService {
  constructor(private readonly prisma: PrismaService) {}

  // Groups several received packages of one locker into a single international
  // shipment (USA -> HN), summing weight and declared value.
  async consolidate(user: AuthUser, dto: ConsolidateInput) {
    const { tenantId, userId } = user;

    for (let attempt = 0; attempt < 3; attempt++) {
      const trackingNumber = generateTrackingNumber();
      try {
        return await this.prisma.withTenant(tenantId, async (tx) => {
          const locker = await tx.locker.findUnique({
            where: { id: dto.lockerId },
            select: { id: true, city: true, state: true, customerId: true },
          });
          if (!locker) {
            throw new NotFoundException('Locker not found');
          }

          const packages = await tx.lockerPackage.findMany({
            where: { id: { in: dto.packageIds }, lockerId: dto.lockerId },
          });
          if (packages.length !== dto.packageIds.length) {
            throw new BadRequestException(
              'Some packages were not found in this locker',
            );
          }
          const notReceived = packages.filter(
            (p) => p.status !== PackageStatus.RECEIVED,
          );
          if (notReceived.length > 0) {
            throw new BadRequestException(
              'All packages must be in RECEIVED status to consolidate',
            );
          }

          // Se suma el peso COBRABLE, no el real.
          //
          // Sumar el real es regalar el flete: tres cajas de almohadas de dos
          // kilos ocupan medio pallet y se facturan por lo que ocupan. El
          // cobrable ya es el máximo entre real y volumétrico, congelado al
          // recibir cada bulto (ver `pesos.ts`), así que aquí solo hay que
          // sumarlo.
          //
          // El `?? p.weightKg` cubre los bultos recibidos ANTES de que existiera
          // la medición: no tienen cobrable, y usar cero los haría gratis.
          const totalWeight = packages.reduce(
            (sum, p) => sum.plus(p.chargeableWeightKg ?? p.weightKg ?? 0),
            new Prisma.Decimal(0),
          );
          const totalValue = packages.reduce(
            (sum, p) => sum.plus(p.declaredValue ?? 0),
            new Prisma.Decimal(0),
          );

          const shipment = await tx.shipment.create({
            data: {
              tenantId,
              customerId: locker.customerId,
              trackingNumber,
              type: ShipmentType.INTERNATIONAL,
              status: ShipmentStatus.CONSOLIDATED,
              recipientName: dto.recipientName,
              recipientPhone: dto.recipientPhone,
              originLabel: `${locker.city}, ${locker.state}`,
              originCountry: 'US',
              destinationLabel: dto.destinationLabel,
              destinationCountry: dto.destinationCountry ?? 'HN',
              destinationLat: dto.destinationLat,
              destinationLng: dto.destinationLng,
              weightKg: totalWeight,
              declaredValue: totalValue,
            },
          });

          await tx.lockerPackage.updateMany({
            where: { id: { in: dto.packageIds } },
            data: {
              status: PackageStatus.CONSOLIDATED,
              shipmentId: shipment.id,
            },
          });

          await registrar(tx, {
            tenantId,
            shipmentId: shipment.id,
            tipo: ShipmentEventType.STATUS_CHANGED,
            status: ShipmentStatus.CONSOLIDATED,
            description: `Se consolidaron ${packages.length} bulto(s)`,
            locationLabel: `${locker.city}, ${locker.state}`,
            actorUserId: userId,
            // Qué bultos entraron: es la trazabilidad bulto → guía, y sin ella
            // hay que reconstruirla mirando qué paquetes apuntan al envío.
            metadata: { packageIds: dto.packageIds, bultos: packages.length },
          });

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
}

export interface ConsolidateInput {
  lockerId: string;
  packageIds: string[];
  recipientName: string;
  recipientPhone?: string;
  destinationLabel?: string;
  destinationCountry?: string;
  destinationLat?: number;
  destinationLng?: number;
}
