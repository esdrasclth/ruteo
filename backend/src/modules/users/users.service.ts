import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
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
  ) {}

  me(tenantId: string, userId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: PUBLIC_SELECT,
      }),
    );
  }

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
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findMany({
        where,
        select: {
          ...PUBLIC_SELECT,
          driver: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      }),
    );
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    this.assertCanTargetRole(actor.role, dto.role);

    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      const user = await this.prisma.withTenant(actor.tenantId, async (tx) => {
        const created = await tx.user.create({
          data: {
            tenantId: actor.tenantId,
            email: dto.email.toLowerCase(),
            name: dto.name ?? null,
            role: dto.role,
            passwordHash,
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

  async resetPassword(
    actor: AuthUser,
    targetId: string,
    dto: ResetPasswordDto,
  ) {
    const target = await this.getTarget(actor.tenantId, targetId);
    if (target.role === Role.OWNER && actor.role !== Role.OWNER) {
      throw new ForbiddenException('Only an owner can reset an owner password');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.withTenant(actor.tenantId, (tx) =>
      tx.user.update({
        where: { id: targetId },
        data: { passwordHash, refreshTokenHash: null },
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
        select: { passwordHash: true },
      }),
    );
    if (!user || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.withTenant(actor.tenantId, (tx) =>
      tx.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
    );

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
