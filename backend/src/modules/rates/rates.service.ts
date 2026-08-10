import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TOPE_CATALOGO } from '../../common/dto/paginacion.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRateDto } from './dto/create-rate.dto';
import { QuoteRateDto } from './dto/quote-rate.dto';
import { UpdateRateDto } from './dto/update-rate.dto';

@Injectable()
export class RatesService {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, dto: CreateRateDto) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.rate.create({
        data: {
          tenantId,
          name: dto.name,
          zoneId: dto.zoneId,
          baseFee: dto.baseFee,
          perKg: dto.perKg,
          perKm: dto.perKm,
          minCharge: dto.minCharge,
          currency: dto.currency ?? 'HNL',
        },
      }),
    );
  }

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.rate.findMany({ orderBy: { name: 'asc' }, take: TOPE_CATALOGO }),
    );
  }

  async findOne(tenantId: string, id: string) {
    const rate = await this.prisma.withTenant(tenantId, (tx) =>
      tx.rate.findUnique({ where: { id } }),
    );
    if (!rate) {
      throw new NotFoundException('Rate not found');
    }
    return rate;
  }

  async update(tenantId: string, id: string, dto: UpdateRateDto) {
    await this.findOne(tenantId, id);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.rate.update({
        where: { id },
        data: {
          name: dto.name,
          zoneId: dto.zoneId,
          baseFee: dto.baseFee,
          perKg: dto.perKg,
          perKm: dto.perKm,
          minCharge: dto.minCharge,
          currency: dto.currency,
          active: dto.active,
        },
      }),
    );
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.rate.delete({ where: { id } }),
    );
    return { deleted: true };
  }

  // Estimates a shipping price: max(minCharge, base + perKg*weight + perKm*distance).
  async quote(tenantId: string, dto: QuoteRateDto) {
    const rate = await this.prisma.withTenant(tenantId, (tx) => {
      if (dto.rateId) {
        return tx.rate.findUnique({ where: { id: dto.rateId } });
      }
      return tx.rate.findFirst({
        where: { active: true, zoneId: dto.zoneId ?? null },
        orderBy: { createdAt: 'asc' },
      });
    });
    if (!rate) {
      throw new BadRequestException('No applicable rate found');
    }

    const distanceKm = dto.distanceKm ?? 0;
    const weightCharge = rate.perKg.mul(dto.weightKg);
    const distanceCharge = rate.perKm.mul(distanceKm);
    const subtotal = rate.baseFee.plus(weightCharge).plus(distanceCharge);
    const total = Prisma.Decimal.max(subtotal, rate.minCharge);

    return {
      rateId: rate.id,
      currency: rate.currency,
      breakdown: {
        baseFee: rate.baseFee,
        weightCharge,
        distanceCharge,
        subtotal,
        minCharge: rate.minCharge,
      },
      total,
    };
  }
}
