"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";

/**
 * Lo que se ve cuando una pantalla revienta al renderizar.
 *
 * Antes no había ninguno de estos: sin `error.tsx`, cualquier excepción de
 * render dejaba la pantalla EN BLANCO, sin mensaje y sin forma de salir que no
 * fuera recargar a mano —y en un teléfono eso significa perder de vista qué
 * estabas haciendo.
 *
 * Lo comparten los cuatro límites de error del árbol (`app`, `(panel)`,
 * `(admin)` y el global) para que un fallo se vea igual en todos, que es la
 * mitad del valor: quien lo ve una vez lo reconoce la siguiente.
 */
export function Fallo({
  error,
  // **`retry`, no `reset`.** En esta versión de Next el límite de error recibe
  // `retry`; el nombre anterior deja el botón sin hacer nada y el fallo parece
  // irrecuperable. Ver `node_modules/next/dist/docs/01-app/01-getting-started/
  // 10-error-handling.md`.
  retry,
  titulo = "Esta pantalla se rompió",
}: {
  error: Error & { digest?: string };
  retry: () => void;
  titulo?: string;
}) {
  useEffect(() => {
    // A la consola del navegador: no hay servicio de errores todavía, y sin
    // esto el fallo desaparece sin dejar rastro que reportar.
    console.error("[panel] fallo de render:", error);
  }, [error]);

  // Un 401 aquí significa que la sesión murió mientras se pintaba. `api()` ya
  // manda a la pantalla de entrada, así que lo que toca es explicarlo, no
  // ofrecer un reintento que volverá a fallar igual.
  const esSesion = error instanceof ApiError && error.status === 401;

  return (
    <div className="flex min-h-64 flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/15">
          <TriangleAlert className="size-5" />
        </span>

        <div className="space-y-1.5">
          <h2 className="text-base font-semibold text-foreground">
            {esSesion ? "Tu sesión caducó" : titulo}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {esSesion
              ? "Vuelve a entrar para seguir donde estabas."
              : "El resto del panel sigue funcionando: puedes volver atrás o reintentar esta pantalla."}
          </p>
          {/* El `digest` es lo único que permite cruzar lo que vio el usuario
              con lo que quedó en los registros del servidor. Se enseña pequeño
              y solo cuando existe. */}
          {error.digest ? (
            <p className="pt-1 font-mono text-[11px] text-muted-foreground/70">
              ref. {error.digest}
            </p>
          ) : null}
        </div>

        {!esSesion ? (
          <Button variant="outline" size="sm" onClick={() => retry()}>
            <RefreshCw className="size-4" />
            Reintentar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
