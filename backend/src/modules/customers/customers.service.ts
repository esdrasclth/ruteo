import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Pagina, saltar } from '../../common/dto/paginacion.dto';
import { coincideSinTildes, patronDe } from '../../common/sql/sin-tildes';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

/** Lo que devuelve el listado: el cliente con sus dos contadores. */
type Cliente = Prisma.CustomerGetPayload<{
  include: { _count: { select: { lockers: true; shipments: true } } };
}>;

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

  /**
   * Los clientes, paginados y buscando sin tildes.
   *
   * Antes traía `take: 100` a secas y sin total: una empresa con 300 clientes
   * veía 100 y nada en la pantalla decía que faltaban 200. Los clientes crecen
   * con la operación, así que van con `PaginacionDto` y no con el tope de
   * catálogo (ver la nota de `paginacion.dto.ts`).
   */
  async list(
    tenantId: string,
    filters: QueryCustomersDto,
  ): Promise<Pagina<Cliente>> {
    const search = filters.search?.trim();

    return this.prisma.withTenant(tenantId, async (tx) => {
      let where: Prisma.CustomerWhereInput = {};

      if (search) {
        // Los ids que coinciden salen de SQL crudo porque hace falta
        // `unaccent()`; el resto de la consulta sigue en el query builder para
        // no perder `_count`, que en SQL habría que escribir a mano.
        //
        // Se materializan TODOS los ids que coinciden, no solo los de la
        // página: es lo que permite que `count` diga la verdad. Está acotado
        // por el tamaño de la tabla del tenant, que a esta escala es de miles.
        // Si algún día molesta, el arreglo no es trocear esto sino una columna
        // normalizada e indexada, y entonces todo vuelve al query builder.
        const filas = await tx.$queryRaw<{ id: string }[]>`
          SELECT id
            FROM customers
           WHERE ${coincideSinTildes(
             ['name', 'email', 'phone', 'document_id'],
             patronDe(search),
           )}`;
        where = { id: { in: filas.map((f) => f.id) } };
      }

      const [items, total] = await Promise.all([
        tx.customer.findMany({
          where,
          include: { _count: { select: { lockers: true, shipments: true } } },
          orderBy: { createdAt: 'desc' },
          skip: saltar(filters),
          take: filters.pageSize,
        }),
        tx.customer.count({ where }),
      ]);

      return { items, total, page: filters.page, pageSize: filters.pageSize };
    });
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
