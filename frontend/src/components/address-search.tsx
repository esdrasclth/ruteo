"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { api, ApiError, GeocodeResult } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Buscador de direcciones sobre OpenStreetMap. Rellena etiqueta + coordenadas
// para que nadie tenga que averiguar a mano la latitud de una colonia.
export function AddressSearch({
  id,
  label,
  placeholder = "Escribe una dirección o un punto conocido…",
  value,
  onChange,
  onPick,
  required,
  hint,
}: {
  id: string;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (r: GeocodeResult) => void;
  required?: boolean;
  hint?: string;
}) {
  const [resultados, setResultados] = useState<GeocodeResult[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  // Marca la escritura que viene de elegir un resultado, para no relanzar la
  // búsqueda con el texto que el propio buscador acaba de escribir.
  const recienElegido = useRef(false);

  const buscar = useCallback(async (q: string) => {
    setBuscando(true);
    try {
      const r = await api<GeocodeResult[]>(
        `/geocoding/search?q=${encodeURIComponent(q)}`,
      );
      setResultados(r);
      setAbierto(true);
      setBuscado(true);
    } catch (err) {
      // Geocodificar es una ayuda: si falla, el usuario sigue pudiendo escribir
      // la dirección y las coordenadas a mano. No se interrumpe con un toast.
      if (!(err instanceof ApiError)) setResultados([]);
      setResultados([]);
      setBuscado(true);
    } finally {
      setBuscando(false);
    }
  }, []);

  // Longitud mínima para consultar. Se deriva en vez de guardarse en estado:
  // limpiar resultados dentro del efecto provocaría renders en cascada.
  const suficiente = value.trim().length >= 3;

  useEffect(() => {
    if (recienElegido.current) {
      recienElegido.current = false;
      return;
    }
    // 600 ms: la política de uso de Nominatim limita a una consulta por segundo
    // y el backend cachea, pero no hay razón para disparar en cada tecla.
    const t = setTimeout(() => {
      const q = value.trim();
      if (q.length < 3) {
        setBuscado(false);
        return;
      }
      void buscar(q);
    }, 600);
    return () => clearTimeout(t);
  }, [value, buscar]);

  useEffect(() => {
    function fuera(e: MouseEvent) {
      if (caja.current && !caja.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  function elegir(r: GeocodeResult) {
    recienElegido.current = true;
    // Se guarda la etiqueta corta, no la completa: el `display_name` de
    // Nominatim pasa de 200 caracteres y los campos de dirección topan en 160,
    // así que guardarlo entero hacía fallar el alta con un error de validación.
    onChange(r.shortLabel);
    onPick(r);
    setAbierto(false);
  }

  return (
    <div className="grid gap-2" ref={caja}>
      <Label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => resultados.length > 0 && setAbierto(true)}
          required={required}
          className="pr-9"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          {buscando ? (
            <Loader2 className="size-4 animate-spin" />
          ) : value ? (
            <button
              type="button"
              aria-label="Limpiar dirección"
              onClick={() => {
                onChange("");
                setResultados([]);
                setBuscado(false);
              }}
              className="rounded transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <X className="size-4" />
            </button>
          ) : (
            <MapPin className="size-4" />
          )}
        </span>

        {abierto && suficiente && resultados.length > 0 ? (
          <ul className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
            {resultados.map((r) => (
              <li key={`${r.lat}-${r.lng}-${r.label}`}>
                <button
                  type="button"
                  onClick={() => elegir(r)}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block">{r.label}</span>
                    <span className="block text-xs tabular-nums text-muted-foreground">
                      {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {abierto && suficiente && buscado && !buscando && resultados.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sin coincidencias. Prueba con un punto cercano conocido (un centro
          comercial, un bulevar) o escribe las coordenadas abajo.
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
