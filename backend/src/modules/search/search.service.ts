import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Cuántos resultados devuelve cada sección. La búsqueda global es para saltar
// rápido a algo concreto, no para explorar: si hay más, el usuario afina el
// texto o entra al listado del módulo.
const POR_SECCION = 5;

const MIN_CARACTERES = 2;

export interface SearchHit {
  id: string;
  titulo: string;
  subtitulo: string | null;
  href: string;
}

export interface SearchResults {
  query: string;
  total: number;
  envios: SearchHit[];
  clientes: SearchHit[];
  casilleros: SearchHit[];
  rutas: SearchHit[];
  repartidores: SearchHit[];
}

// Las consultas van en SQL crudo porque necesitan `unaccent()`, que el query
// builder de Prisma no expone: `mode: 'insensitive'` solo ignora mayúsculas y
// dejaría "lopez" sin encontrar "López". Corren dentro de `withTenant`, así que
// RLS sigue filtrando por tenant igual que el resto del backend.
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(tenantId: string, rawQuery: string): Promise<SearchResults> {
    const q = rawQuery.trim();
    if (q.length < MIN_CARACTERES) {
      return this.vacio(q);
    }
    const patron = `%${q}%`;

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [envios, clientes, casilleros, rutas, repartidores] =
        await Promise.all([
          tx.$queryRaw<
            { id: string; tracking_number: string; recipient_name: string }[]
          >`
            SELECT id, tracking_number, recipient_name
              FROM shipments
             WHERE unaccent(tracking_number) ILIKE unaccent(${patron})
                OR unaccent(recipient_name)  ILIKE unaccent(${patron})
                OR unaccent(coalesce(recipient_phone, '')) ILIKE unaccent(${patron})
                OR unaccent(coalesce(destination_label, '')) ILIKE unaccent(${patron})
             ORDER BY created_at DESC
             LIMIT ${POR_SECCION}`,

          tx.$queryRaw<
            {
              id: string;
              name: string;
              email: string | null;
              phone: string | null;
            }[]
          >`
            SELECT id, name, email, phone
              FROM customers
             WHERE unaccent(name) ILIKE unaccent(${patron})
                OR unaccent(coalesce(email, '')) ILIKE unaccent(${patron})
                OR unaccent(coalesce(phone, '')) ILIKE unaccent(${patron})
             ORDER BY name ASC
             LIMIT ${POR_SECCION}`,

          tx.$queryRaw<{ id: string; code: string; customer_name: string }[]>`
            SELECT id, code, customer_name
              FROM lockers
             WHERE unaccent(code) ILIKE unaccent(${patron})
                OR unaccent(customer_name) ILIKE unaccent(${patron})
             ORDER BY code ASC
             LIMIT ${POR_SECCION}`,

          tx.$queryRaw<
            { id: string; code: string; driver_name: string | null }[]
          >`
            SELECT r.id, r.code, d.name AS driver_name
              FROM routes r
              LEFT JOIN drivers d ON d.id = r.driver_id
             WHERE unaccent(r.code) ILIKE unaccent(${patron})
                OR unaccent(coalesce(d.name, '')) ILIKE unaccent(${patron})
             ORDER BY r.scheduled_date DESC
             LIMIT ${POR_SECCION}`,

          tx.$queryRaw<{ id: string; name: string; phone: string | null }[]>`
            SELECT id, name, phone
              FROM drivers
             WHERE unaccent(name) ILIKE unaccent(${patron})
                OR unaccent(coalesce(phone, '')) ILIKE unaccent(${patron})
             ORDER BY name ASC
             LIMIT ${POR_SECCION}`,
        ]);

      const resultado: SearchResults = {
        query: q,
        total: 0,
        envios: envios.map((e) => ({
          id: e.id,
          titulo: e.tracking_number,
          subtitulo: e.recipient_name,
          href: `/shipments/${e.id}`,
        })),
        clientes: clientes.map((c) => ({
          id: c.id,
          titulo: c.name,
          subtitulo: c.email ?? c.phone,
          href: `/customers/${c.id}`,
        })),
        casilleros: casilleros.map((l) => ({
          id: l.id,
          titulo: l.code,
          subtitulo: l.customer_name,
          href: `/lockers/${l.id}`,
        })),
        rutas: rutas.map((r) => ({
          id: r.id,
          titulo: r.code,
          subtitulo: r.driver_name,
          href: `/routes/${r.id}`,
        })),
        // Los repartidores no tienen pantalla propia: se enlazan a sus rutas,
        // que es lo que se quiere ver al buscar a uno.
        repartidores: repartidores.map((d) => ({
          id: d.id,
          titulo: d.name,
          subtitulo: d.phone,
          href: `/routes?driverId=${d.id}`,
        })),
      };

      resultado.total =
        resultado.envios.length +
        resultado.clientes.length +
        resultado.casilleros.length +
        resultado.rutas.length +
        resultado.repartidores.length;

      return resultado;
    });
  }

  // Ids de envíos que coinciden con el texto, para que el listado paginado use
  // el mismo criterio (sin acentos) que la búsqueda global.
  async shipmentIdsMatching(
    tx: Prisma.TransactionClient,
    search: string,
    limite = 500,
  ): Promise<string[]> {
    const patron = `%${search.trim()}%`;
    const filas = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM shipments
       WHERE unaccent(tracking_number) ILIKE unaccent(${patron})
          OR unaccent(recipient_name)  ILIKE unaccent(${patron})
          OR unaccent(coalesce(recipient_phone, '')) ILIKE unaccent(${patron})
          OR unaccent(coalesce(destination_label, '')) ILIKE unaccent(${patron})
       ORDER BY created_at DESC
       LIMIT ${limite}`;
    return filas.map((f) => f.id);
  }

  private vacio(query: string): SearchResults {
    return {
      query,
      total: 0,
      envios: [],
      clientes: [],
      casilleros: [],
      rutas: [],
      repartidores: [],
    };
  }
}
