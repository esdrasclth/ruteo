"use client";

import { Button } from "@/components/ui/button";

/**
 * El pie de paginación de un listado.
 *
 * Estaba copiado a mano en cinco pantallas y faltaba en otras tantas, que es
 * como se llegó a que varias listas cortaran en 100 filas sin decirlo. Aquí va
 * una sola vez.
 *
 * **Dice cuántos hay, no solo en qué página estás.** Es la mitad que faltaba:
 * «Página 1 de 3» obliga a hacer la cuenta, y un courier que ve 100 clientes
 * necesita leer que tiene 287 sin tener que multiplicar nada.
 *
 * Con una sola página no se dibujan los botones, pero SÍ el total: en una lista
 * corta el recuento sigue informando y los botones solo serían dos controles
 * apagados.
 */
export function Paginacion({
  page,
  pageSize,
  total,
  onPage,
  /** Cómo se llama lo que se está contando, en plural. */
  etiqueta = "resultados",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  etiqueta?: string;
}) {
  const paginas = Math.max(1, Math.ceil(total / pageSize));
  // `total` puede ser 0 mientras carga; ahí no hay nada que decir todavía.
  if (total === 0) return null;

  const desde = (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {paginas === 1 ? (
          <>
            {total} {etiqueta}
          </>
        ) : (
          <>
            {desde}–{hasta} de {total} {etiqueta}
          </>
        )}
      </p>

      {paginas > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {paginas}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= paginas}
            onClick={() => onPage(page + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </div>
  );
}
