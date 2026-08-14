"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Campo de contraseña con el ojo para verla.
 *
 * Existe como componente y no como un ojo repetido en cada formulario porque
 * son diez campos en ocho pantallas: escribirlo suelto garantiza que dentro de
 * unos meses unos tengan el ojo y otros no, y que el `aria-label` diga una cosa
 * distinta en cada sitio.
 *
 * Acepta las mismas props que `Input` salvo `type`, que lo gobierna él: un
 * `type="text"` fijo desde fuera dejaría la contraseña visible siempre.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        // Sitio para el botón: sin esto, una contraseña larga pasa por debajo
        // del ojo y no se lee ni con el ojo activado.
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        // `tabIndex={-1}` a propósito: al tabular desde la contraseña se espera
        // llegar al botón de entrar, no a un control decorativo en medio.
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        // El botón no se deshabilita con el campo: mirar lo que uno ya escribió
        // no cambia nada, y bloquearlo mientras el formulario se envía es
        // justo cuando más falta hace comprobar si había una errata.
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-r-md"
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        // Lo anuncia a un lector de pantalla sin necesidad de leer el icono.
        aria-pressed={visible}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}
