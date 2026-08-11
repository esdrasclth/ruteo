import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Una empresa donde existe un correo. Ver `candidatosPorCorreo`. */
export interface CandidatoDeAcceso {
  tenantId: string;
  slug: string;
  nombre: string;
  userId: string;
  /** Espejo de `UserStatus`; llega como texto desde la función SQL. */
  userStatus: string;
}

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

  /**
   * Empresas en las que existe un correo, para el login del panel raíz.
   *
   * Devuelve CANDIDATOS, no accesos: el correo puede estar dado de alta en
   * varias empresas y aquí no se ha comprobado ninguna contraseña todavía. Lo
   * que autoriza es la verificación contra ZITADEL que hace `AuthService`
   * después, una por candidato.
   *
   * Tampoco se filtra por estado del tenant: entrar por el subdominio de una
   * empresa suspendida hoy funciona, y esto tiene que comportarse igual o
   * habría dos reglas distintas para la misma cuenta según por dónde entre.
   */
  async candidatosPorCorreo(email: string): Promise<CandidatoDeAcceso[]> {
    const filas = await this.prisma.$queryRaw<
      {
        out_tenant_id: string;
        out_tenant_slug: string;
        out_tenant_name: string;
        out_user_id: string;
        out_user_status: string;
      }[]
    >`SELECT * FROM tenants_by_user_email(${email.toLowerCase()})`;

    return filas.map((f) => ({
      tenantId: f.out_tenant_id,
      slug: f.out_tenant_slug,
      nombre: f.out_tenant_name,
      userId: f.out_user_id,
      userStatus: f.out_user_status,
    }));
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
