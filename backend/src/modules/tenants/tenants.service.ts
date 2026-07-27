import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  // Resolves a tenant id by slug without a tenant context (used at login).
  // Backed by a SECURITY DEFINER function so RLS does not leak other tenants.
  async resolveIdBySlug(slug: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<{ tenant_id_by_slug: string }[]>`
      SELECT tenant_id_by_slug(${slug})`;
    return rows[0]?.tenant_id_by_slug ?? null;
  }

  async findById(tenantId: string) {
    const tenant = await this.prisma.withTenant(tenantId, (tx) =>
      tx.tenant.findUnique({ where: { id: tenantId } }),
    );
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }
}
