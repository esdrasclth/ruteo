import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

type ContactInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  documentId?: string | null;
};

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, dto: CreateCustomerDto) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.customer.create({
        data: {
          tenantId,
          name: dto.name,
          email: dto.email?.trim() || null,
          phone: dto.phone?.trim() || null,
          documentId: dto.documentId?.trim() || null,
          notes: dto.notes,
        },
      }),
    );
  }

  list(tenantId: string, filters: QueryCustomersDto) {
    const search = filters.search?.trim();
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.customer.findMany({
        where: search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { documentId: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {},
        include: { _count: { select: { lockers: true, shipments: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }

  async findOne(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id },
        include: {
          lockers: { orderBy: { createdAt: 'desc' } },
          shipments: {
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: {
              id: true,
              trackingNumber: true,
              type: true,
              status: true,
              createdAt: true,
            },
          },
        },
      });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }

      const grouped = await tx.payment.groupBy({
        by: ['status'],
        where: { shipment: { is: { customerId: id } } },
        _sum: { amount: true },
        _count: { _all: true },
      });
      const paymentSummary = grouped.map((row) => ({
        status: row.status,
        count: row._count._all,
        amount: row._sum.amount,
      }));

      return { ...customer, paymentSummary };
    });
  }

  async update(tenantId: string, id: string, dto: UpdateCustomerDto) {
    await this.ensureExists(tenantId, id);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.customer.update({
        where: { id },
        data: {
          name: dto.name,
          email: dto.email !== undefined ? dto.email?.trim() || null : undefined,
          phone: dto.phone !== undefined ? dto.phone?.trim() || null : undefined,
          documentId:
            dto.documentId !== undefined
              ? dto.documentId?.trim() || null
              : undefined,
          notes: dto.notes,
        },
      }),
    );
  }

  // Resolve a customer for the given contact within an existing transaction.
  // Matches an existing customer by phone or email; otherwise creates one.
  async findOrCreateByContact(
    tx: Prisma.TransactionClient,
    tenantId: string,
    contact: ContactInput,
  ) {
    const email = contact.email?.trim() || null;
    const phone = contact.phone?.trim() || null;

    const or: Prisma.CustomerWhereInput[] = [];
    if (phone) or.push({ phone });
    if (email) or.push({ email });

    if (or.length > 0) {
      const existing = await tx.customer.findFirst({ where: { OR: or } });
      if (existing) return existing;
    }

    return tx.customer.create({
      data: {
        tenantId,
        name: contact.name,
        email,
        phone,
        documentId: contact.documentId?.trim() || null,
      },
    });
  }

  private async ensureExists(tenantId: string, id: string) {
    const customer = await this.prisma.withTenant(tenantId, (tx) =>
      tx.customer.findUnique({ where: { id }, select: { id: true } }),
    );
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
  }
}
