"use client";

import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

/**
 * Elegir UNA cosa de una lista que no cabe en un desplegable.
 *
 * Un `<Select>` obliga a traerse la lista entera antes de que el usuario elija.
 * Con clientes, envíos o casilleros eso es una lista que crece con la operación:
 * o se descarga completa —y en una empresa con tres mil clientes son tres mil
 * filas por cada alta de envío— o se corta en cien y entonces **el que buscas
 * simplemente no está**, sin que nada lo explique. Las dos salidas son malas.
 *
 * Aquí se teclea y se pregunta al servidor. Es lo que ya prescribía
 * `paginacion.dto.ts` en el backend: «que el desplegable que lo consume busque
 * contra el servidor en vez de traérselo entero».
 *
 * No pide nada hasta que hay término: con la clave a `null`, `useApi` no
 * dispara. Así abrir un formulario no cuesta una consulta que quizá no se use.
 */
export function BuscadorRemoto<T extends { id: string }>({
  ruta,
  extraer,
  etiqueta,
  detalle,
  elegido,
  onElegir,
  placeholder = "Escribe para buscar…",
  minimo = 2,
  id,
  requerido,
}: {
  /** La ruta a consultar con el término ya escrito. */
  ruta: (termino: string) => string;
  /** De la respuesta a la lista. Absorbe si viene paginada o como array. */
  extraer: (datos: never) => T[];
  etiqueta: (item: T) => string;
  detalle?: (item: T) => string | null | undefined;
  /** Lo ya elegido, para poder pintarlo sin volver a buscarlo. */
  elegido: T | null;
  onElegir: (item: T | null) => void;
  placeholder?: string;
  minimo?: number;
  id?: string;
  requerido?: boolean;
}) {
  const [termino, setTermino] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const generado = useId();
  const inputId = id ?? `buscador-${generado}`;
  const listboxId = `${inputId}-opciones`;

  // Debounce: sin esto se lanza una consulta por tecla. El `setState` vive
  // dentro del temporizador, no en el cuerpo del efecto.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(termino.trim()), 220);
    return () => clearTimeout(t);
  }, [termino]);

  const buscando = abierto && debounced.length >= minimo;
  const { datos, cargando } = useApi<never>(
    buscando ? ruta(debounced) : null,
    { silencioso: true, keepPreviousData: true },
  );

  const opciones = datos ? extraer(datos) : [];

  // La selección vuelve arriba con cada término nuevo. Ajustado en el render,
  // que es la forma que documenta React; ver `usePagina`.
  const [buscadoAntes, setBuscadoAntes] = useState("");
  if (buscadoAntes !== debounced) {
    setBuscadoAntes(debounced);
    setActivo(0);
  }

  // Cerrar al tocar fuera. Sin esto la lista se queda abierta encima del resto
  // del formulario y tapa los campos siguientes.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  function elegir(item: T) {
    onElegir(item);
    setTermino("");
    setAbierto(false);
  }

  function alTeclear(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setAbierto(false);
      return;
    }
    if (opciones.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo((i) => (i + 1) % opciones.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((i) => (i - 1 + opciones.length) % opciones.length);
    } else if (e.key === "Enter") {
      // Sin esto, Enter sobre la lista envía el formulario que la contiene.
      e.preventDefault();
      elegir(opciones[activo]);
    }
  }

  // Ya hay algo elegido: se enseña como una ficha con su aspa, no como un campo
  // de texto con el nombre dentro. Un campo editable invita a corregirlo a mano
  // y lo tecleado no cambiaría la selección de verdad.
  if (elegido) {
    return (
      <button
        id={inputId}
        type="button"
        onClick={() => onElegir(null)}
        aria-label={`${etiqueta(elegido)} seleccionado. Quitar selección`}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm">{etiqueta(elegido)}</span>
          {detalle?.(elegido) ? (
            <span className="block truncate text-xs text-muted-foreground">
              {detalle(elegido)}
            </span>
          ) : null}
        </span>
        <span className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground">
          <X className="size-3.5" />
        </span>
      </button>
    );
  }

  return (
    <div ref={caja} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={inputId}
          value={termino}
          required={requerido}
          onChange={(e) => {
            setTermino(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={alTeclear}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={listboxId}
          aria-activedescendant={
            abierto && opciones.length > 0
              ? `${listboxId}-opcion-${activo}`
              : undefined
          }
          aria-autocomplete="list"
          className="h-9 w-full rounded-md border border-border bg-transparent pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary/40"
        />
        {cargando ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {abierto ? (
        // `absolute` y no en flujo: en un formulario en rejilla, empujar el
        // contenido movería los campos de al lado cada vez que se teclea.
        <div
          id={listboxId}
          role="listbox"
          aria-label="Resultados de búsqueda"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          {debounced.length < minimo ? (
            <p
              role="presentation"
              className="px-3 py-3 text-center text-xs text-muted-foreground"
            >
              Escribe al menos {minimo} caracteres.
            </p>
          ) : opciones.length === 0 && !cargando ? (
            <p
              role="presentation"
              className="px-3 py-3 text-center text-xs text-muted-foreground"
            >
              Nada coincide con «{debounced}». La búsqueda ignora las tildes.
            </p>
          ) : (
            opciones.map((item, i) => (
              <button
                key={item.id}
                id={`${listboxId}-opcion-${i}`}
                type="button"
                role="option"
                aria-selected={i === activo}
                onMouseEnter={() => setActivo(i)}
                onClick={() => elegir(item)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors",
                  i === activo ? "bg-accent" : "hover:bg-muted",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {etiqueta(item)}
                  </span>
                  {detalle?.(item) ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {detalle(item)}
                    </span>
                  ) : null}
                </span>
                {i === activo ? (
                  <Check className="size-3.5 shrink-0 text-primary" />
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {cargando
          ? "Buscando"
          : abierto && debounced.length < minimo
            ? `Escribe al menos ${minimo} caracteres`
            : buscando
            ? `${opciones.length} resultado${opciones.length === 1 ? "" : "s"}`
            : ""}
      </p>
    </div>
  );
}

/** Envoltura tipada de `extraer` para respuestas `{ items }` o array suelto. */
export function itemsDe<T>(datos: unknown): T[] {
  if (Array.isArray(datos)) return datos as T[];
  if (datos && typeof datos === "object" && "items" in datos) {
    return (datos as { items: T[] }).items;
  }
  return [];
}

export type NodoDetalle = ReactNode;
