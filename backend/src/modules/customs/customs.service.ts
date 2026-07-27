import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomsStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { computeCharges } from './customs-calc';
import { UpsertCustomsDto } from './dto/upsert-customs.dto';

@Injectable()
export class CustomsService {
  constructor(private readonly prisma: PrismaService) {}

  // Creates or updates the customs record for a shipment, recomputing the
  // estimated Honduras import charges (duty + tax + handling).
  async upsert(tenantId: string, dto: UpsertCustomsDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: dto.shipmentId },
        select: { id: true, declaredValue: true, currency: true },
      });
      if (!shipment) {
        throw new NotFoundException('Shipment not found');
      }

      const declaredValue = dto.declaredValue ?? shipment.declaredValue ?? 0;
      const charges = computeCharges({
        declaredValue,
        dutyRate: dto.dutyRate,
        taxRate: dto.taxRate,
        handlingFee: dto.handlingFee,
      });

      const data = {
        status: dto.status,
        declaredValue,
        dutyAmount: charges.dutyAmount,
        taxAmount: charges.taxAmount,
        handlingFee: charges.handlingFee,
        totalCharges: charges.totalCharges,
        currency: dto.currency ?? shipment.currency,
        notes: dto.notes,
      };

      return tx.customsRecord.upsert({
        where: { shipmentId: dto.shipmentId },
        create: {
          tenantId,
          shipmentId: dto.shipmentId,
          ...data,
          status: dto.status ?? CustomsStatus.PENDING,
        },
        update: data,
      });
    });
  }

  async findByShipment(tenantId: string, shipmentId: string) {
    const record = await this.prisma.withTenant(tenantId, (tx) =>
      tx.customsRecord.findUnique({ where: { shipmentId } }),
    );
    if (!record) {
      throw new NotFoundException('Customs record not found');
    }
    return record;
  }

  // Marks the shipment as cleared through customs.
  async clear(tenantId: string, shipmentId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const record = await tx.customsRecord.findUnique({
        where: { shipmentId },
        select: { id: true, status: true },
      });
      if (!record) {
        throw new NotFoundException('Customs record not found');
      }
      if (record.status === CustomsStatus.CLEARED) {
        throw new BadRequestException('Customs record is already cleared');
      }
      return tx.customsRecord.update({
        where: { shipmentId },
        data: { status: CustomsStatus.CLEARED, clearedAt: new Date() },
      });
    });
  }
}
