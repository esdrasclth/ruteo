import { Prisma } from '@prisma/client';

/**
 * Buscar ignorando tildes, que es como se busca en español.
 *
 * `mode: 'insensitive'` de Prisma solo ignora mayúsculas: "lopez" NO encuentra
 * "López". Y en un panel en español nadie teclea las tildes al buscar, así que
 * media búsqueda no encuentra nada y parece que el dato no está.
 *
 * La única forma de arreglarlo es `unaccent()` de Postgres (extensión activada
 * en la migración `20260727060000_unaccent`), y el query builder de Prisma no
 * lo expone. De ahí el SQL crudo.
 *
 * Esto ya lo hacían la búsqueda global y envíos, cada uno con su copia del
 * mismo SQL. Estaba aquí el problema: al escribirlo a mano en cada servicio,
 * los que se añadieron después se quedaron con `contains`, y buscar "lopez"
 * encontraba a López en ⌘K pero no en la pantalla de Clientes.
 *
 * **Se usa DENTRO de `withTenant`**, como el resto de consultas crudas del
 * backend: RLS sigue filtrando por empresa igual que con el query builder.
 */

/**
 * Nombres de columna admitidos.
 *
 * Van interpolados con `Prisma.raw`, que NO parametriza —es la única manera de
 * meter un identificador en la consulta—, así que se validan aquí. Hoy todas
 * las llamadas pasan literales escritos en el código y ninguna viene del
 * usuario; esta comprobación es para que siga siendo verdad el día que alguien
 * lo llame con una variable.
 */
const COLUMNA_VALIDA = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;

/**
 * `unaccent(col) ILIKE unaccent(patrón)` sobre varias columnas, unidas por OR.
 *
 * `coalesce` porque casi todas las columnas por las que se busca son opcionales
 * —correo, teléfono, documento— y en SQL `NULL ILIKE algo` no es falso, es
 * NULL: sin esto, una fila sin teléfono no coincidiría ni por su nombre.
 *
 *     const patron = `%${termino}%`;
 *     const filas = await tx.$queryRaw<{ id: string }[]>`
 *       SELECT id FROM customers
 *        WHERE ${coincideSinTildes(['name', 'email'], patron)}`;
 */
export function coincideSinTildes(
  columnas: string[],
  patron: string,
): Prisma.Sql {
  if (columnas.length === 0) {
    throw new Error('coincideSinTildes necesita al menos una columna');
  }
  for (const c of columnas) {
    if (!COLUMNA_VALIDA.test(c)) {
      throw new Error(`Nombre de columna no admitido: ${c}`);
    }
  }

  return Prisma.join(
    columnas.map(
      (c) =>
        Prisma.sql`unaccent(coalesce(${Prisma.raw(c)}, '')) ILIKE unaccent(${patron})`,
    ),
    ' OR ',
  );
}

/** El patrón de un término libre: coincide en cualquier parte del texto. */
export function patronDe(termino: string): string {
  return `%${termino}%`;
}
