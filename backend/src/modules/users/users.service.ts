import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { saltar } from '../../common/dto/paginacion.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CredentialsService } from '../auth/credentials.service';
import {
  nombreDeUsuario,
  ZitadelService,
} from '../auth/zitadel/zitadel.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const PUBLIC_SELECT = {
  id: true,
  email: true,
  name: true,
  emailVerified: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly zitadel: ZitadelService,
    private readonly credenciales: CredentialsService,
  ) {}

  // El nombre de usuario en ZITADEL lleva el slug del tenant delante, así que
  // casi toda operación de credencial necesita resolverlo.
  private async slugDe(tenantId: string): Promise<string> {
    const t = await this.prisma.withTenant(tenantId, (tx) =>
      tx.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
    );
    if (!t) throw new NotFoundException('Tenant not found');
    return t.slug;
  }

  me(tenantId: string, userId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: PUBLIC_SELECT,
      }),
    );
  }

  // Paginado: la lista del equipo incluye a los usuarios ligados a clientes y
  // repartidores, así que en una empresa con muchos de ellos deja de ser corta.
  list(tenantId: string, query: QueryUsersDto) {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [total, items] = await Promise.all([
        tx.user.count({ where }),
        tx.user.findMany({
          where,
          select: {
            ...PUBLIC_SELECT,
            driver: { select: { id: true, name: true } },
            customer: { select: { id: true, name: true } },
          },
          orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
          skip: saltar(query),
          take: query.pageSize,
        }),
      ]);
      return { items, total, page: query.page, pageSize: query.pageSize };
    });
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    this.assertCanTargetRole(actor.role, dto.role);

    // Igual que en el registro: primero ZITADEL. Si el alta local falla se
    // compensa borrando allí, para no dejar una cuenta que además bloquearía
    // reintentar con el mismo correo (el nombre es único en la instancia).
    const slug = await this.slugDe(actor.tenantId);
    // La cuenta nace con una contraseña aleatoria que NADIE ve —ni el admin ni
    // el invitado—: existe solo porque ZITADEL exige una al crear el usuario.
    // La real la elige el invitado al aceptar la invitación.
    const externalId = await this.zitadel.crearUsuario({
      loginName: nombreDeUsuario(slug, dto.email),
      email: dto.email.toLowerCase(),
      // Un UUID (122 bits de entropía) más lo justo para cumplir la política de
      // complejidad. NO se concatenan dos: ZITADEL aplica el tope de 72 bytes
      // de bcrypt y con dos se pasa —devuelve 500 y el alta falla entera.
      password: `${randomUUID()}Aa1!`,
      nombre: dto.name ?? undefined,
    });

    try {
      const user = await this.prisma.withTenant(actor.tenantId, async (tx) => {
        const created = await tx.user.create({
          data: {
            tenantId: actor.tenantId,
            email: dto.email.toLowerCase(),
            name: dto.name ?? null,
            role: dto.role,
            externalId,
          },
          select: PUBLIC_SELECT,
        });

        if (dto.driverId) {
          await this.linkDriver(tx, dto.driverId, created.id);
        }
        if (dto.customerId) {
          await this.linkCustomer(tx, dto.customerId, created.id);
        }
        return created;
      });

      // La invitación se manda sin bloquear el alta: si el correo falla, la
      // cuenta ya existe y se puede reenviar desde el panel. Cortar el alta
      // dejaría un usuario en ZITADEL con el nombre cogido y sin fila local.
      void this.credenciales
        .enviarInvitacion(actor.tenantId, user.id, dto.email.toLowerCase())
        .catch(() => undefined);

      this.audit.dispatch(actor.tenantId, {
        action: 'user.created',
        entityType: 'user',
        entityId: user.id,
        actor: { userId: actor.userId, role: actor.role },
        metadata: { email: user.email, role: user.role },
      });
      return user;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already in use');
      }
      throw error;
    }
  }

  async update(actor: AuthUser, targetId: string, dto: UpdateUserDto) {
    const target = await this.getTarget(actor.tenantId, targetId);
    const isSelf = actor.userId === targetId;

    // Only OWNER may manage an existing OWNER account.
    if (target.role === Role.OWNER && actor.role !== Role.OWNER) {
      throw new ForbiddenException('Only an owner can modify an owner');
    }

    if (dto.role !== undefined && dto.role !== target.role) {
      if (isSelf) {
        throw new ForbiddenException('You cannot change your own role');
      }
      this.assertCanTargetRole(actor.role, dto.role);
      // Demoting the last active owner is not allowed.
      if (target.role === Role.OWNER) {
        await this.assertNotLastOwner(actor.tenantId, targetId);
      }
    }

    if (dto.status !== undefined && dto.status !== target.status) {
      if (isSelf) {
        throw new ForbiddenException('You cannot change your own status');
      }
      if (
        dto.status === UserStatus.DISABLED &&
        target.role === Role.OWNER
      ) {
        await this.assertNotLastOwner(actor.tenantId, targetId);
      }
    }

    const updated = await this.prisma.withTenant(actor.tenantId, (tx) =>
      tx.user.update({
        where: { id: targetId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          // Force re-authentication when an account is disabled.
          ...(dto.status === UserStatus.DISABLED
            ? { refreshTokenHash: null }
            : {}),
        },
        select: PUBLIC_SELECT,
      }),
    );

    this.audit.dispatch(actor.tenantId, {
      action: 'user.updated',
      entityType: 'user',
      entityId: targetId,
      actor: { userId: actor.userId, role: actor.role },
      metadata: {
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    return updated;
  }

  private async externalIdDe(
    tenantId: string,
    userId: string,
  ): Promise<string> {
    const u = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findUnique({
        where: { id: userId },
        select: { externalId: true },
      }),
    );
    if (!u?.externalId) {
      throw new NotFoundException('User has no identity provider account');
    }
    return u.externalId;
  }

  async resetPassword(
    actor: AuthUser,
    targetId: string,
    dto: ResetPasswordDto,
  ) {
    const target = await this.getTarget(actor.tenantId, targetId);
    if (target.role === Role.OWNER && actor.role !== Role.OWNER) {
      throw new ForbiddenException('Only an owner can reset an owner password');
    }

    // Restablecimiento por un administrador: aquí NO se pide la contraseña
    // anterior a propósito, que es el sentido de la operación. El control es de
    // permisos (la comprobación de OWNER de arriba), no de credencial.
    const externo = await this.externalIdDe(actor.tenantId, targetId);
    await this.zitadel.establecerContrasena(externo, dto.newPassword);

    // La sesión abierta del usuario se corta: si le restablecen la contraseña,
    // el refresh que tuviera en marcha no debe seguir sirviendo.
    await this.prisma.withTenant(actor.tenantId, (tx) =>
      tx.user.update({
        where: { id: targetId },
        data: { refreshTokenHash: null },
      }),
    );

    this.audit.dispatch(actor.tenantId, {
      action: 'user.password_reset',
      entityType: 'user',
      entityId: targetId,
      actor: { userId: actor.userId, role: actor.role },
    });
    return { ok: true };
  }

  async changePassword(actor: AuthUser, dto: ChangePasswordDto) {
    const userId = actor.userId!;
    const user = await this.prisma.withTenant(actor.tenantId, (tx) =>
      tx.user.findUnique({
        where: { id: userId },
        select: { email: true, externalId: true },
      }),
    );
    if (!user?.externalId) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // La contraseña actual se comprueba AQUÍ, con la Session API, y no se
    // delega en `verification.currentPassword` de ZITADEL.
    //
    // Motivo, comprobado contra la instancia el 2026-08-08: llamando al
    // endpoint de contraseña con el token de la cuenta de servicio, ZITADEL
    // ignora esa verificación —acepta el cambio con la actual equivocada y
    // devuelve 200—. Delegarla habría dejado cambiar la contraseña sin conocer
    // la anterior, con la comprobación aparentando funcionar.
    const slug = await this.slugDe(actor.tenantId);
    try {
      await this.zitadel.verificarCredenciales(
        nombreDeUsuario(slug, user.email),
        dto.currentPassword,
      );
    } catch {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.zitadel.establecerContrasena(user.externalId, dto.newPassword);

    this.audit.dispatch(actor.tenantId, {
      action: 'user.password_changed',
      entityType: 'user',
      entityId: userId,
      actor: { userId, role: actor.role },
    });
    return { ok: true };
  }

  private async getTarget(tenantId: string, targetId: string) {
    const target = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findUnique({
        where: { id: targetId },
        select: { id: true, role: true, status: true },
      }),
    );
    if (!target) {
      throw new NotFoundException('User not found');
    }
    return target;
  }

  // Only an OWNER may create or assign the OWNER role.
  private assertCanTargetRole(actorRole: Role, targetRole: Role) {
    if (targetRole === Role.OWNER && actorRole !== Role.OWNER) {
      throw new ForbiddenException('Only an owner can assign the owner role');
    }
  }

  private async assertNotLastOwner(tenantId: string, excludeUserId: string) {
    const remaining = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.count({
        where: {
          role: Role.OWNER,
          status: UserStatus.ACTIVE,
          id: { not: excludeUserId },
        },
      }),
    );
    if (remaining === 0) {
      throw new BadRequestException(
        'Cannot remove the last active owner of the workspace',
      );
    }
  }

  private async linkDriver(
    tx: Prisma.TransactionClient,
    driverId: string,
    userId: string,
  ) {
    const driver = await tx.driver.findUnique({
      where: { id: driverId },
      select: { id: true, userId: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver to link not found');
    }
    if (driver.userId) {
      throw new ConflictException('Driver is already linked to a user');
    }
    await tx.driver.update({ where: { id: driverId }, data: { userId } });
  }

  private async linkCustomer(
    tx: Prisma.TransactionClient,
    customerId: string,
    userId: string,
  ) {
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
      select: { id: true, userId: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer to link not found');
    }
    if (customer.userId) {
      throw new ConflictException('Customer is already linked to a user');
    }
    await tx.customer.update({ where: { id: customerId }, data: { userId } });
  }
}
