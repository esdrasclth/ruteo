import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditActor {
  userId: string | null;
  role: Role;
}

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  actor?: AuditActor | null;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Persists an audit entry for the tenant. Actor is optional (system actions or
  // API-key requests may have no user).
  record(tenantId: string, input: AuditInput) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.auditLog.create({
        data: {
          tenantId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          actorUserId: input.actor?.userId ?? null,
          actorRole: input.actor?.role ?? null,
          metadata: input.metadata,
        },
      }),
    );
  }

  // Fire-and-forget: audit failures must never break the originating request.
  dispatch(tenantId: string, input: AuditInput) {
    void this.record(tenantId, input).catch((err) =>
      this.logger.error(`Audit dispatch failed: ${String(err)}`),
    );
  }

  list(
    tenantId: string,
    filters: {
      action?: string;
      entityType?: string;
      entityId?: string;
      page: number;
      pageSize: number;
    },
  ) {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.entityId ? { entityId: filters.entityId } : {}),
    };
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [total, items] = await Promise.all([
        tx.auditLog.count({ where }),
        tx.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
        }),
      ]);
      return { items, total, page: filters.page, pageSize: filters.pageSize };
    });
  }
}
