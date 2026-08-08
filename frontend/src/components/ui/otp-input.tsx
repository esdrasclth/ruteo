"use client";

import {
  ClipboardEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { cn } from "@/lib/utils";

const LARGO = 6;

/**
 * Campo de código de un solo uso: una casilla por dígito.
 *
 * No es decoración. Un `input` corriente de seis dígitos obliga a mirar dónde
 * va uno al teclear y no da forma de corregir el tercero sin borrar los tres
 * siguientes. Con casillas el avance es automático, el retroceso vuelve a la
 * anterior, y pegar el código del correo lo reparte solo — que es lo que hace
 * la gente el 90% de las veces.
 *
 * `variant`: "claro" para el panel, "oscuro" para las pantallas de acceso, que
 * van sobre el lienzo de marca.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
  variant = "claro",
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  variant?: "claro" | "oscuro";
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digitos = useMemo(
    () => Array.from({ length: LARGO }, (_, i) => value[i] ?? ""),
    [value],
  );

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function poner(i: number, char: string) {
    const limpio = char.replace(/\D/g, "");
    if (!limpio) return;
    const siguiente = (value.slice(0, i) + limpio + value.slice(i + 1)).slice(
      0,
      LARGO,
    );
    onChange(siguiente);
    if (i < LARGO - 1) refs.current[i + 1]?.focus();
    if (siguiente.length === LARGO) onComplete?.(siguiente);
  }

  function alTeclear(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digitos[i]) {
        onChange(value.slice(0, i) + value.slice(i + 1));
      } else if (i > 0) {
        // Casilla vacía: se borra la anterior y el foco retrocede, que es lo
        // que espera quien corrige a ciegas.
        onChange(value.slice(0, i - 1) + value.slice(i));
        refs.current[i - 1]?.focus();
      }
    }
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < LARGO - 1) refs.current[i + 1]?.focus();
  }

  function alPegar(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pegado = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pegado) return;
    const siguiente = pegado.slice(0, LARGO);
    onChange(siguiente);
    refs.current[Math.min(siguiente.length, LARGO - 1)]?.focus();
    if (siguiente.length === LARGO) onComplete?.(siguiente);
  }

  const oscuro = variant === "oscuro";

  return (
    <div className="flex items-center gap-2 sm:gap-2.5" onPaste={alPegar}>
      {digitos.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          onChange={(e) => poner(i, e.target.value)}
          onKeyDown={(e) => alTeclear(i, e)}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Dígito ${i + 1} de ${LARGO}`}
          maxLength={1}
          className={cn(
            "h-12 w-11 rounded-xl border text-center font-mono text-lg tabular-nums transition-all outline-none disabled:opacity-50 sm:h-14 sm:w-12 sm:text-xl",
            oscuro
              ? // Borde y fondo más marcados que en `auth-field`: seis casillas
                // vacías con el borde tenue del formulario se leían como huecos
                // del diseño y no como campos donde hay que escribir.
                "border-white/25 bg-white/8 text-white focus-visible:border-[#56b3a5] focus-visible:bg-white/12 focus-visible:ring-[3px] focus-visible:ring-[#56b3a5]/20"
              : "border-border bg-white text-foreground focus-visible:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-primary/15",
            // La casilla con dígito se refuerza: da sensación de avance y deja
            // ver de un vistazo cuántos faltan.
            d && (oscuro ? "border-white/45" : "border-primary/30"),
          )}
        />
      ))}
    </div>
  );
}
