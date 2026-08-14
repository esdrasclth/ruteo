import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

/**
 * Las direcciones reutilizables de un cliente (fase 5.2).
 *
 * Va en el módulo de clientes y no en uno propio: una dirección no existe sin
 * su cliente, y una entrada de menú más no es más producto (§7 del plan).
 */
@Injectable()
export class DireccionesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Las direcciones que se pueden usar hoy.
   *
   * Las archivadas quedan fuera por defecto: la lista existe para elegir a
   * dónde mandar un envío, y ofrecer una dirección que alguien archivó
   * precisamente porque ya no vale ahí es volver a cometer el error a mano.
   * Con `incluirArchivadas` salen todas, que es lo que necesita el histórico.
   */
  listar(tenantId: string, customerId: string, incluirArchivadas = false) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.asegurarCliente(tx, customerId);
      return tx.customerAddress.findMany({
        where: {
          customerId,
          ...(incluirArchivadas ? {} : { active: true }),
        },
        // La de por defecto primero: es la que se va a elegir el 90% de las
        // veces y hacerla buscar en una lista de ocho no tiene sentido.
        orderBy: [{ isDefault: 'desc' }, { label: 'asc' }],
      });
    });
  }

  async crear(tenantId: string, customerId: string, dto: CreateAddressDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.asegurarCliente(tx, customerId);

      // La primera dirección de un cliente es la de por defecto aunque nadie lo
      // pida. Sin esto, el caso normal —un cliente con una sola dirección—
      // acabaría con cero por defecto y el alta de envíos no propondría
      // ninguna, que es peor que proponer la única que hay.
      const esPrimera =
        (await tx.customerAddress.count({ where: { customerId, active: true } })) ===
        0;
      const porDefecto = dto.isDefault ?? esPrimera;

      if (porDefecto) {
        await this.desmarcarAnterior(tx, customerId);
      }

      return tx.customerAddress.create({
        data: {
          tenantId,
          customerId,
          ...this.campos(dto),
          // Los tres obligatorios van explícitos: `campos()` los devuelve como
          // opcionales porque lo comparte con la edición, donde sí pueden faltar.
          label: dto.label,
          department: dto.department,
          municipality: dto.municipality,
          isDefault: porDefecto,
        },
      });
    });
  }

  async actualizar(tenantId: string, id: string, dto: UpdateAddressDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const actual = await this.cargar(tx, id);

      if (dto.isDefault) {
        await this.desmarcarAnterior(tx, actual.customerId, id);
      }

      return tx.customerAddress.update({
        where: { id },
        data: {
          ...this.campos(dto),
          isDefault: dto.isDefault,
        },
      });
    });
  }

  /**
   * Archivar, que no es borrar.
   *
   * A una dirección la referencian envíos ya entregados. Borrarla dejaría el
   * historial sin la única pista de que cuarenta envíos fueron al mismo sitio
   * —los campos planos del envío dicen a dónde, pero no que fuera LA MISMA
   * dirección—. Archivada deja de ofrecerse y sigue explicando el pasado.
   */
  async archivar(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.cargar(tx, id);
      return tx.customerAddress.update({
        where: { id },
        data: {
          active: false,
          // Se le quita el «por defecto» al archivarla. Si se quedara puesto, el
          // índice único parcial impediría marcar otra —cree que ya hay una— y
          // el cliente se quedaría sin ninguna que proponer.
          isDefault: false,
        },
      });
    });
  }

  /**
   * Deja sólo una por defecto.
   *
   * Lo impone además un índice único parcial en la base, pero ese índice
   * rechaza la escritura; esto la hace posible. Sin desmarcar antes, marcar una
   * segunda dirección como preferida fallaría con un error de restricción que
   * al usuario no le dice nada.
   */
  private desmarcarAnterior(
    tx: Prisma.TransactionClient,
    customerId: string,
    excepto?: string,
  ) {
    return tx.customerAddress.updateMany({
      where: {
        customerId,
        isDefault: true,
        ...(excepto ? { id: { not: excepto } } : {}),
      },
      data: { isDefault: false },
    });
  }

  /** Los campos que se copian tal cual, con el texto vacío tratado como nulo. */
  private campos(dto: UpdateAddressDto) {
    return {
      label: dto.label,
      department: dto.department,
      municipality: dto.municipality,
      neighborhood: dto.neighborhood?.trim() || undefined,
      street: dto.street?.trim() || undefined,
      reference: dto.reference?.trim() || undefined,
      recipientName: dto.recipientName?.trim() || undefined,
      recipientPhone: dto.recipientPhone?.trim() || undefined,
      lat: dto.lat,
      lng: dto.lng,
    };
  }

  private async cargar(tx: Prisma.TransactionClient, id: string) {
    const direccion = await tx.customerAddress.findUnique({
      where: { id },
      select: { id: true, customerId: true },
    });
    if (!direccion) {
      throw new NotFoundException('Dirección no encontrada');
    }
    return direccion;
  }

  private async asegurarCliente(tx: Prisma.TransactionClient, id: string) {
    const cliente = await tx.customer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!cliente) {
      throw new NotFoundException('Customer not found');
    }
  }
}
