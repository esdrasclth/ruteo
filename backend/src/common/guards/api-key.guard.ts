import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiScope, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { hashApiKey } from '../../modules/api-keys/api-keys.service';
import { AuthUser } from '../decorators/current-user.decorator';

export const API_KEY_HEADER = 'x-api-key';

interface ApiKeyRow {
  tenant_id: string;
  key_hash: string;
  revoked_at: Date | null;
  scopes: ApiScope[];
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const raw = request.headers[API_KEY_HEADER];
    const apiKey = Array.isArray(raw) ? raw[0] : raw;
    if (typeof apiKey !== 'string' || !apiKey.startsWith('rk_')) {
      throw new UnauthorizedException('Invalid API key');
    }
    const prefix = apiKey.split('_')[1];
    if (!prefix) {
      throw new UnauthorizedException('Invalid API key');
    }

    const rows = await this.prisma.$queryRaw<ApiKeyRow[]>`
      SELECT tenant_id, key_hash, revoked_at, scopes FROM api_key_by_prefix(${prefix})`;
    const row = rows[0];
    if (!row || row.revoked_at) {
      throw new UnauthorizedException('Invalid API key');
    }
    if (hashApiKey(apiKey) !== row.key_hash) {
      throw new UnauthorizedException('Invalid API key');
    }

    // El rol sigue siendo `MERCHANT` y los alcances viajan aparte: son dos
    // filtros distintos y encadenarlos es lo que hace que una llave nunca pueda
    // más que el rol. `AlcancesGuard` es quien los mira.
    const user: AuthUser = {
      userId: null,
      tenantId: row.tenant_id,
      role: Role.MERCHANT,
      llave: { prefix, alcances: row.scopes ?? [] },
    };
    request.user = user;

    // Best-effort touch of lastUsedAt; never blocks the request.
    void this.prisma
      .withTenant(row.tenant_id, (tx) =>
        tx.apiKey.updateMany({
          where: { prefix },
          data: { lastUsedAt: new Date() },
        }),
      )
      .catch(() => undefined);

    return true;
  }
}
