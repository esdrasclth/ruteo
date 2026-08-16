"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Contact,
  CornerDownLeft,
  Loader2,
  Package,
  Route as RouteIcon,
  Search,
  Users,
} from "lucide-react";
import { SearchHit, SearchResults } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

type Seccion = {
  clave: keyof Omit<SearchResults, "query" | "total">;
  label: string;
  icon: typeof Package;
};

const SECCIONES: Seccion[] = [
  { clave: "envios", label: "Envíos", icon: Package },
  { clave: "clientes", label: "Clientes", icon: Contact },
  { clave: "casilleros", label: "Casilleros", icon: Archive },
  { clave: "rutas", label: "Rutas", icon: RouteIcon },
  { clave: "repartidores", label: "Repartidores", icon: Users },
];

const MIN_CARACTERES = 2;

/**
 * El buscador se DESMONTA al cerrarse, y por eso ya no hace falta vaciarlo.
 *
 * Antes el componente seguía montado con un `if (!open) return null` dentro, y
 * el estado sobrevivía: había que limpiarlo desde un `useEffect` que hacía tres
 * `setState` seguidos —lo que marcaba `react-hooks/set-state-in-effect`—. Este
 * envoltorio corta el árbol de verdad, y React se lleva el estado con él.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!open) return null;
  return <Paleta onOpenChange={onOpenChange} />;
}

function Paleta({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [activo, setActivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Cada búsqueda nueva vuelve la selección al primer resultado. Ajustado
  // durante el render y no desde un efecto, que es la forma que documenta React
  // para «reiniciar estado cuando cambian los datos»; ver `usePagina`.
  const [buscadoAntes, setBuscadoAntes] = useState("");

  // Debounce: el buscador dispara una consulta por tecla si no se espera. El
  // `setState` vive dentro del temporizador, no en el cuerpo del efecto, que es
  // lo que separa «sincronizar con algo de fuera» —legítimo— de un render en
  // cascada.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 220);
    return () => clearTimeout(t);
  }, [q]);

  // Por debajo del mínimo la clave es nula y no se pide nada. Y como la clave
  // ES el término, buscar dos veces lo mismo —volver a abrir el buscador y
  // repetir la guía— sale de la caché sin ir a la red.
  //
  // De paso desaparece el descarte manual de respuestas fuera de orden: SWR
  // solo entrega la respuesta de la clave vigente.
  const { datos: resultados, cargando } = useApi<SearchResults>(
    debounced.length < MIN_CARACTERES
      ? null
      : `/search?q=${encodeURIComponent(debounced)}`,
    { silencioso: true, keepPreviousData: true },
  );

  if (buscadoAntes !== debounced) {
    setBuscadoAntes(debounced);
    setActivo(0);
  }

  // Lista plana en el orden en que se pinta, para que las flechas recorran
  // todas las secciones como una sola lista.
  const planos: SearchHit[] = resultados
    ? SECCIONES.flatMap((s) => resultados[s.clave])
    : [];

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  const irA = useCallback(
    (hit: SearchHit) => {
      onOpenChange(false);
      router.push(hit.href);
    },
    [onOpenChange, router],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onOpenChange(false);
      return;
    }
    if (planos.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo((i) => (i + 1) % planos.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((i) => (i - 1 + planos.length) % planos.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      irA(planos[activo]);
    }
  }

  const termino = q.trim();
  let indiceGlobal = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[#04151f]/40 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
      role="presentation"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_60px_-20px_rgba(4,21,31,0.45)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Búsqueda global"
      >
        <div className="flex items-center gap-3 border-b border-border/70 px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar guía, cliente, casillero, ruta o repartidor…"
            className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Término de búsqueda"
          />
          {cargando ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
              ESC
            </kbd>
          )}
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {termino.length < MIN_CARACTERES ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Escribe al menos {MIN_CARACTERES} caracteres para buscar en todo
              el panel.
            </p>
          ) : resultados && resultados.total === 0 && !cargando ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Sin resultados para <span className="font-medium">{termino}</span>
              .
            </p>
          ) : (
            SECCIONES.map((seccion) => {
              const hits = resultados?.[seccion.clave] ?? [];
              if (hits.length === 0) return null;
              const Icon = seccion.icon;
              return (
                <div key={seccion.clave} className="mb-1 last:mb-0">
                  <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {seccion.label}
                  </p>
                  {hits.map((hit) => {
                    indiceGlobal += 1;
                    const esActivo = indiceGlobal === activo;
                    const indice = indiceGlobal;
                    return (
                      <button
                        key={hit.id}
                        type="button"
                        onClick={() => irA(hit)}
                        onMouseEnter={() => setActivo(indice)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                          esActivo ? "bg-accent" : "hover:bg-muted",
                        )}
                      >
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {hit.titulo}
                          </span>
                          {hit.subtitulo ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {hit.subtitulo}
                            </span>
                          ) : null}
                        </span>
                        {esActivo ? (
                          <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// Atajo global: ⌘K / Ctrl+K desde cualquier pantalla del panel.
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen };
}
