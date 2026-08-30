"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Cambio = string | number | null | undefined;

/**
 * Mantiene filtros y paginación en la URL sin provocar una recarga ni mover el
 * scroll. El navegador conserva así una vista al recargar, compartir el enlace
 * o usar Atrás/Adelante.
 */
export function useUrlFilters() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const actualizar = useCallback(
    (cambios: Record<string, Cambio>, modo: "push" | "replace" = "replace") => {
      const siguientes = new URLSearchParams(searchParams.toString());
      for (const [nombre, valor] of Object.entries(cambios)) {
        if (valor === null || valor === undefined || valor === "") {
          siguientes.delete(nombre);
        } else {
          siguientes.set(nombre, String(valor));
        }
      }
      const query = siguientes.toString();
      window.history[modo === "push" ? "pushState" : "replaceState"](
        null,
        "",
        query ? `${pathname}?${query}` : pathname,
      );
    },
    [pathname, searchParams],
  );

  return { searchParams, actualizar };
}

/** Borrador con debounce para un buscador cuyo valor aplicado vive en la URL. */
export function useUrlSearch(nombre = "search", esperaMs = 300) {
  const { searchParams, actualizar } = useUrlFilters();
  const aplicado = searchParams.get(nombre) ?? "";
  const [borrador, setBorrador] = useState(aplicado);
  const [aplicadoPrevio, setAplicadoPrevio] = useState(aplicado);

  // Atrás/Adelante cambia la URL desde fuera del input. Se ajusta durante el
  // render para que el campo y los resultados nunca enseñen filtros distintos.
  if (aplicadoPrevio !== aplicado) {
    setAplicadoPrevio(aplicado);
    setBorrador(aplicado);
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      const limpio = borrador.trim();
      if (limpio !== aplicado) {
        actualizar({ [nombre]: limpio || null, page: null });
      }
    }, esperaMs);
    return () => window.clearTimeout(t);
  }, [actualizar, aplicado, borrador, esperaMs, nombre]);

  return { borrador, setBorrador, aplicado };
}

export function paginaDesdeUrl(searchParams: URLSearchParams) {
  const page = Number(searchParams.get("page"));
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function opcionDesdeUrl<T extends string>(
  searchParams: URLSearchParams,
  nombre: string,
  permitidas: readonly T[],
  predeterminada: T,
) {
  const valor = searchParams.get(nombre) as T | null;
  return valor && permitidas.includes(valor) ? valor : predeterminada;
}
