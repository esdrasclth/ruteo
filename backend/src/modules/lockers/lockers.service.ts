import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationChannel, PackageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateLockerDto } from './dto/create-locker.dto';
import { IntakePackageDto } from './dto/intake-package.dto';
import { calcularPesos } from './pesos';
import { AddPackagePhotoDto } from './dto/add-photo.dto';
import { StorageService } from '../../storage/storage.service';
import { PreAlertPackageDto } from './dto/pre-alert-package.dto';
import { QueryLockersDto } from './dto/query-lockers.dto';
import { QueryPackagesDto } from './dto/query-packages.dto';
import { UpdateLockerDto } from './dto/update-locker.dto';
import { generateLockerCode } from './locker-code';
import { packageReceivedMessage } from './package-message';
import { Pagina, saltar, TOPE_CATALOGO } from '../../common/dto/paginacion.dto';
import { coincideSinTildes, patronDe } from '../../common/sql/sin-tildes';

/** Un bulto con el casillero al que pertenece. */
type BultoConCasillero = Prisma.LockerPackageGetPayload<{
  include: { locker: { select: { id: true; code: true; customerName: true } } };
}>;

@Injectable()
export class LockersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly customers: CustomersService,
    private readonly storage: StorageService,
  ) {}

  async create(tenantId: string, dto: CreateLockerDto) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = dto.code ?? generateLockerCode();
      try {
        return await this.prisma.withTenant(tenantId, async (tx) => {
          const customer = dto.customerId
            ? await this.requireCustomer(tx, dto.customerId)
            : await this.customers.findOrCreateByContact(tx, tenantId, {
                name: dto.customerName,
                email: dto.customerEmail,
                phone: dto.customerPhone,
              });
          return tx.locker.create({
            data: {
              tenantId,
              customerId: customer.id,
              code,
              customerName: customer.name,
              customerEmail: customer.email,
              customerPhone: customer.phone,
              addressLine1: dto.addressLine1,
              addressLine2: dto.addressLine2,
              city: dto.city,
              state: dto.state,
              postalCode: dto.postalCode,
              country: dto.country ?? 'US',
            },
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          if (dto.code) {
            throw new BadRequestException(
              `Locker code "${dto.code}" already exists`,
            );
          }
          continue; // generated code collision, retry
        }
        throw error;
      }
    }
    throw new BadRequestException('Could not allocate a locker code');
  }

  /**
   * Los casilleros, con tope y búsqueda sin tildes.
   *
   * Antes era un `findMany` **sin ningún límite**: una empresa con miles de
   * casilleros se los descargaba todos en cada carga de la pantalla de
   * Recepción, que además los filtraba en el navegador. `TOPE_CATALOGO` pone
   * techo y `search` mueve el filtro al servidor, que es donde escala.
   *
   * Sigue devolviendo un array y no una página: este endpoint está abierto a
   * llaves de API y cambiarle la forma rompería las integraciones. Ver la nota
   * de `QueryLockersDto`.
   */
  list(tenantId: string, filtros: QueryLockersDto = {}) {
    const search = filtros.search?.trim();

    return this.prisma.withTenant(tenantId, async (tx) => {
      const where: Prisma.LockerWhereInput = {
        ...(filtros.status ? { status: filtros.status } : {}),
      };

      if (search) {
        const filas = await tx.$queryRaw<{ id: string }[]>`
          SELECT id
            FROM lockers
           WHERE ${coincideSinTildes(
             ['code', 'customer_name', 'customer_email', 'customer_phone'],
             patronDe(search),
           )}`;
        where.id = { in: filas.map((f) => f.id) };
      }

      return tx.locker.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: TOPE_CATALOGO,
      });
    });
  }

  async findOne(tenantId: string, id: string) {
    const locker = await this.prisma.withTenant(tenantId, (tx) =>
      tx.locker.findUnique({
        where: { id },
        include: { packages: { orderBy: { preAlertedAt: 'desc' } } },
      }),
    );
    if (!locker) {
      throw new NotFoundException('Locker not found');
    }
    return locker;
  }

  async update(tenantId: string, id: string, dto: UpdateLockerDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const current = await tx.locker.findUnique({
        where: { id },
        select: { id: true, customerId: true },
      });
      if (!current) {
        throw new NotFoundException('Locker not found');
      }

      const locker = await tx.locker.update({
        where: { id },
        data: {
          code: dto.code,
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          customerPhone: dto.customerPhone,
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2,
          city: dto.city,
          state: dto.state,
          postalCode: dto.postalCode,
          country: dto.country,
          status: dto.status,
        },
      });

      // Keep the linked customer's contact cache in sync with the locker.
      const syncsContact =
        dto.customerName !== undefined ||
        dto.customerEmail !== undefined ||
        dto.customerPhone !== undefined;
      if (current.customerId && syncsContact) {
        await tx.customer.update({
          where: { id: current.customerId },
          data: {
            name: dto.customerName,
            email:
              dto.customerEmail !== undefined
                ? dto.customerEmail || null
                : undefined,
            phone:
              dto.customerPhone !== undefined
                ? dto.customerPhone || null
                : undefined,
          },
        });
      }

      return locker;
    });
  }

  // Customer/warehouse declares an incoming package ("pre-alerta").
  async preAlert(tenantId: string, lockerId: string, dto: PreAlertPackageDto) {
    await this.ensureExists(tenantId, lockerId);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.lockerPackage.create({
        data: {
          tenantId,
          lockerId,
          externalTracking: dto.externalTracking,
          merchant: dto.merchant,
          description: dto.description,
          weightKg: dto.weightKg,
          declaredValue: dto.declaredValue,
          currency: dto.currency ?? 'USD',
          // Lo que el cliente sabe y la bodega no puede adivinar. Sin tienda ni
          // número de orden, un paquete con la etiqueta ilegible no se puede
          // casar con nadie.
          storeName: dto.storeName,
          orderNumber: dto.orderNumber,
          estimatedArrival: dto.estimatedArrival
            ? new Date(dto.estimatedArrival)
            : undefined,
          category: dto.category,
          // La factura se pide aquí, el día que el cliente compra. Pedírsela
          // cuando el paquete ya está en aduana es pedírsela justo cuando el
          // trámite está parado esperándola.
          invoiceFileId: dto.invoiceFileId,
        },
      }),
    );
  }

  listPackages(tenantId: string, lockerId: string, status?: PackageStatus) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.lockerPackage.findMany({
        where: { lockerId, ...(status ? { status } : {}) },
        orderBy: { preAlertedAt: 'desc' },
      }),
    );
  }

  // Warehouse confirms the package physically arrived at the USA facility.
  async receivePackage(tenantId: string, lockerId: string, packageId: string) {
    const { pkg, locker } = await this.prisma.withTenant(
      tenantId,
      async (tx) => {
        const current = await tx.lockerPackage.findFirst({
          where: { id: packageId, lockerId },
          select: { id: true, status: true },
        });
        if (!current) {
          throw new NotFoundException('Package not found');
        }
        if (current.status !== PackageStatus.PRE_ALERTED) {
          throw new BadRequestException(
            `Package cannot be received from status ${current.status}`,
          );
        }
        const pkg = await tx.lockerPackage.update({
          where: { id: packageId },
          data: { status: PackageStatus.RECEIVED, receivedAt: new Date() },
        });
        const locker = await tx.locker.findUnique({
          where: { id: lockerId },
          select: { code: true, customerPhone: true, customerEmail: true },
        });
        return { pkg, locker };
      },
    );

    this.notifyReceived(tenantId, locker, pkg);
    return pkg;
  }

  /**
   * Adjunta una foto ya subida a un bulto.
   *
   * El `fileId` se comprueba contra la base con el contexto del tenant puesto,
   * así que el RLS ya impide adjuntar el archivo de otra empresa: si no es suyo,
   * la fila no existe desde aquí.
   */
  async addPhoto(
    tenantId: string,
    lockerId: string,
    packageId: string,
    dto: AddPackagePhotoDto,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const pkg = await tx.lockerPackage.findFirst({
        where: { id: packageId, lockerId },
        select: { id: true },
      });
      if (!pkg) {
        throw new NotFoundException('Package not found');
      }
      const archivo = await tx.fileObject.findUnique({
        where: { id: dto.fileId },
        select: { id: true },
      });
      if (!archivo) {
        throw new NotFoundException('El archivo no existe');
      }
      return tx.packagePhoto.create({
        data: {
          tenantId,
          packageId,
          fileId: dto.fileId,
          type: dto.type,
        },
      });
    });
  }

  /** Las fotos de un bulto, con URL firmada para poder verlas. */
  async listPhotos(tenantId: string, packageId: string) {
    const fotos = await this.prisma.withTenant(tenantId, (tx) =>
      tx.packagePhoto.findMany({
        where: { packageId },
        orderBy: { createdAt: 'asc' },
        include: { file: { select: { key: true, originalName: true } } },
      }),
    );

    // La URL se firma AL LEER y dura minutos. Guardarla sería dejar escrito un
    // pase que funciona sin sesión.
    return Promise.all(
      fotos.map(async (foto) => ({
        id: foto.id,
        type: foto.type,
        createdAt: foto.createdAt,
        originalName: foto.file.originalName,
        url: await this.storage
          .firmarDescarga(foto.file.key, tenantId)
          // Que una foto no se pueda firmar no debe tumbar la galería entera:
          // se pierde esa imagen, no la pantalla.
          .catch(() => null),
      })),
    );
  }

  private notifyReceived(
    tenantId: string,
    locker: {
      code: string;
      customerPhone: string | null;
      customerEmail: string | null;
    } | null,
    pkg: {
      externalTracking: string | null;
      description: string | null;
      merchant: string | null;
    },
  ) {
    if (!locker) return;
    const channel = locker.customerPhone
      ? NotificationChannel.SMS
      : locker.customerEmail
        ? NotificationChannel.EMAIL
        : null;
    const recipient = locker.customerPhone ?? locker.customerEmail;
    if (!channel || !recipient) return;

    this.notifications.dispatch(tenantId, {
      channel,
      recipient,
      type: 'locker.package_received',
      title: `Casillero ${locker.code}`,
      body: packageReceivedMessage(locker.code, pkg),
    });
  }

  // Warehouse intake in one step: matches an existing pre-alert by external
  // tracking (option A) or creates a new package already RECEIVED. Notifies.
  async intake(tenantId: string, dto: IntakePackageDto, userId?: string) {
    const tracking = dto.externalTracking?.trim() || undefined;

    // El divisor sale del tenant, no de una constante: cambia por courier y por
    // acuerdo comercial, y con el valor en el código cada acuerdo sería un
    // despliegue.
    const { volumetricDivisor } = await this.prisma.withTenant(tenantId, (tx) =>
      tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { volumetricDivisor: true },
      }),
    );

    // Se calcula UNA vez, al recibir, y se guarda. Recalcularlo al leer haría
    // que tocar el divisor cambiara facturas ya emitidas.
    const pesos = calcularPesos(
      dto.weightKg,
      {
        lengthCm: dto.lengthCm,
        widthCm: dto.widthCm,
        heightCm: dto.heightCm,
      },
      volumetricDivisor,
    );
    const { pkg, locker, matched } = await this.prisma.withTenant(
      tenantId,
      async (tx) => {
        const locker = await tx.locker.findUnique({
          where: { id: dto.lockerId },
          select: {
            id: true,
            code: true,
            customerPhone: true,
            customerEmail: true,
          },
        });
        if (!locker) {
          throw new NotFoundException('Locker not found');
        }

        const existing = tracking
          ? await tx.lockerPackage.findFirst({
              where: {
                lockerId: dto.lockerId,
                externalTracking: tracking,
                status: PackageStatus.PRE_ALERTED,
              },
              select: { id: true },
            })
          : null;

        const data = {
          merchant: dto.merchant,
          description: dto.description,
          weightKg: dto.weightKg,
          declaredValue: dto.declaredValue,
          currency: dto.currency,
          // Lo medido en bodega. `receivedByUserId` no es burocracia: un daño
          // que aparece después necesita saber quién tuvo el bulto delante, y
          // sin esto la respuesta es «alguien».
          lengthCm: dto.lengthCm,
          widthCm: dto.widthCm,
          heightCm: dto.heightCm,
          volumetricWeightKg: pesos.volumetricWeightKg,
          chargeableWeightKg: pesos.chargeableWeightKg,
          pieces: dto.pieces,
          condition: dto.condition,
          receivedByUserId: userId,
          // Datos de prealerta que pueden llegar corregidos en la recepción:
          // la tienda que el cliente no puso, o la categoría que el operador ve
          // al abrir la caja.
          storeName: dto.storeName,
          orderNumber: dto.orderNumber,
          category: dto.category,
        };

        const pkg = existing
          ? await tx.lockerPackage.update({
              where: { id: existing.id },
              data: {
                ...data,
                status: PackageStatus.RECEIVED,
                receivedAt: new Date(),
              },
            })
          : await tx.lockerPackage.create({
              data: {
                tenantId,
                lockerId: dto.lockerId,
                externalTracking: tracking,
                ...data,
                currency: dto.currency ?? 'USD',
                status: PackageStatus.RECEIVED,
                receivedAt: new Date(),
              },
            });

        return { pkg, locker, matched: existing !== null };
      },
    );

    this.notifyReceived(tenantId, locker, pkg);
    return { ...pkg, matched };
  }

  /**
   * Los bultos de todos los casilleros, para la pantalla de recepción.
   *
   * Busca sin tildes y va paginado. Antes hacía las dos cosas mal: `contains`
   * no encontraba «Rodríguez» tecleando «rodriguez», y el `take: 100` cortaba
   * la bandeja sin decirlo —justo en la pantalla que se usa para vaciar una
   * descarga entera.
   */
  async listAllPackages(
    tenantId: string,
    filters: QueryPackagesDto,
  ): Promise<Pagina<BultoConCasillero>> {
    const search = filters.search?.trim();

    return this.prisma.withTenant(tenantId, async (tx) => {
      const where: Prisma.LockerPackageWhereInput = {
        ...(filters.status ? { status: filters.status } : {}),
      };

      if (search) {
        // El join con `lockers` va aquí y no en el query builder porque se
        // busca también por código de casillero y por nombre del cliente, que
        // viven en la otra tabla. Ver `sin-tildes.ts`.
        const filas = await tx.$queryRaw<{ id: string }[]>`
          SELECT p.id
            FROM locker_packages p
            JOIN lockers l ON l.id = p.locker_id
           WHERE ${coincideSinTildes(
             [
               'p.external_tracking',
               'p.merchant',
               'p.description',
               'l.code',
               'l.customer_name',
             ],
             patronDe(search),
           )}`;
        where.id = { in: filas.map((f) => f.id) };
      }

      const [items, total] = await Promise.all([
        tx.lockerPackage.findMany({
          where,
          include: {
            locker: { select: { id: true, code: true, customerName: true } },
          },
          orderBy: [{ receivedAt: 'desc' }, { preAlertedAt: 'desc' }],
          skip: saltar(filters),
          take: filters.pageSize,
        }),
        tx.lockerPackage.count({ where }),
      ]);

      return { items, total, page: filters.page, pageSize: filters.pageSize };
    });
  }

  private async ensureExists(tenantId: string, id: string) {
    const locker = await this.prisma.withTenant(tenantId, (tx) =>
      tx.locker.findUnique({ where: { id }, select: { id: true } }),
    );
    if (!locker) {
      throw new NotFoundException('Locker not found');
    }
  }

  private async requireCustomer(tx: Prisma.TransactionClient, id: string) {
    const customer = await tx.customer.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }
}
