import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * Página pedida por quien consulta un listado.
 *
 * Los listados que **crecen con el uso** (envíos, pagos, rutas, usuarios) la
 * heredan. Sin ella, `findMany` se trae la tabla entera del tenant: una empresa
 * con un año de operación se descarga miles de filas en cada carga de pantalla,
 * y el coste lo paga tanto la base como el navegador.
 *
 * Los catálogos —zonas, tarifas, transportistas, repartidores, webhooks— NO la
 * usan: no crecen con la operación sino con el tamaño de la empresa, y varios
 * alimentan desplegables donde media lista es peor que una lista lenta. Esos
 * llevan un tope duro (`TOPE_CATALOGO`), que es lo que ya hacía `customers`.
 */
export class PaginacionDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  /** Cursor opaco para evitar recorridos costosos en páginas profundas. */
  @ApiPropertyOptional({ description: 'ID de la última fila recibida' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

/** Forma de respuesta de todo listado paginado. */
export interface Pagina<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  nextCursor?: string | null;
}

/** Cuántas filas saltar para llegar a la página pedida. */
export function saltar(p: PaginacionDto): number {
  return (p.page - 1) * p.pageSize;
}

/**
 * Tope de los listados de catálogo.
 *
 * No es una página: es el punto donde se deja de servir. Se elige alto a
 * propósito —una empresa con más de 500 repartidores o 500 tarifas es un caso
 * que no existe todavía— porque el objetivo aquí no es paginar sino que ninguna
 * consulta pueda quedar sin techo.
 *
 * Si alguna vez se roza, el arreglo NO es subir el número: es que ese listado
 * pase a `PaginacionDto` y que el desplegable que lo consume busque contra el
 * servidor en vez de traérselo entero.
 */
export const TOPE_CATALOGO = 500;
