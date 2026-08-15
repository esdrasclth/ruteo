import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

export function hashApiKey(fullKey: string): string {
  return createHash('sha256').update(fullKey).digest('hex');
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Generates a `rk_<prefix>_<secret>` key. Only the prefix and a sha256 hash
  // of the full key are stored; the plaintext is returned once and never again.
  async create(actor: AuthUser, dto: CreateApiKeyDto) {
    const { tenantId } = actor;
    const prefix = randomBytes(6).toString('hex');
    const secret = randomBytes(24).toString('base64url');
    const fullKey = `rk_${prefix}_${secret}`;

    const record = await this.prisma.withTenant(tenantId, (tx) =>
      tx.apiKey.create({
        data: {
          tenantId,
          name: dto.name,
          prefix,
          keyHash: hashApiKey(fullKey),
          scopes: dto.scopes,
        },
        select: {
          id: true,
          name: true,
          prefix: true,
          scopes: true,
          createdAt: true,
        },
      }),
    );

    // Los alcances van a la bitácora porque son la mitad de lo que se concedió.
    // Una entrada que sólo diga «se creó una llave» no permite responder
    // después a qué llegó a tener acceso quien la tuviera.
    this.audit.dispatch(tenantId, {
      action: 'api_key.created',
      entityType: 'api_key',
      entityId: record.id,
      actor: { userId: actor.userId, role: actor.role },
      metadata: {
        name: record.name,
        prefix: record.prefix,
        scopes: record.scopes,
      },
    });

    return { ...record, key: fullKey };
  }

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.apiKey.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          prefix: true,
          scopes: true,
          lastUsedAt: true,
          revokedAt: true,
          createdAt: true,
        },
      }),
    );
  }

  async revoke(actor: AuthUser, id: string) {
    const { tenantId } = actor;
    const result = await this.prisma.withTenant(tenantId, (tx) =>
      tx.apiKey.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
    if (result.count === 0) {
      throw new NotFoundException('API key not found or already revoked');
    }
    this.audit.dispatch(tenantId, {
      action: 'api_key.revoked',
      entityType: 'api_key',
      entityId: id,
      actor: { userId: actor.userId, role: actor.role },
    });
    return { revoked: true };
  }
}
