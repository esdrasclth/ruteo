import { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface Paso {
  etiqueta: string;
  valor: number | string;
  href?: string;
  /** Pinta el paso en rojo: hay carga parada ahí. */
  alerta?: boolean;
}

/**
 * Una etapa de la operación contada como recorrido, no como cuatro tarjetas.
 *
 * Es lo que sustituye a los grupos «Aduana» y «Última milla», que eran ocho
 * cifras del mismo tamaño y con el mismo peso visual que las cosas urgentes. El
 * problema no era el dato sino la forma: **son fases de un mismo trayecto**, y
 * dibujarlas como tarjetas sueltas obliga a reconstruir mentalmente el orden en
 * el que van. Puestas en fila, el orden se lee solo y ocupan una línea.
 *
 * Cada paso enlaza a donde se actúa sobre él cuando ese sitio existe. Los que no
 * tienen destino no son un enlace, en vez de fingir que lo son.
 */
export function Recorrido({
  titulo,
  pasos,
  extra,
  vacio,
}: {
  titulo: string;
  pasos: Paso[];
  /** Una cifra que acompaña pero no es parte del trayecto (p. ej. un KPI). */
  extra?: ReactNode;
  /** Qué decir cuando todos los pasos están en cero. */
  vacio: string;
}) {
  // Todo en cero: una línea, no cuatro ceros. Cuatro ceros del mismo tamaño que
  // las cifras de verdad ocupan un bloque entero para no decir nada, y es
  // exactamente lo que hacía que la pantalla se sintiera llena estando vacía.
  const todoCero = pasos.every((p) => Number(p.valor) === 0);

  return (
    <section className="glass-card flex flex-col rounded-2xl p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold text-foreground/75">{titulo}</h3>
        {extra}
      </div>

      {todoCero ? (
        <p className="mt-3 text-sm text-muted-foreground">{vacio}</p>
      ) : (
        // `justify-between` y no una fila pegada a la izquierda: dentro de una
        // columna estrecha los pasos se reparten el ancho en vez de amontonarse
        // a un lado y dejar media tarjeta vacía, que es lo que hacía que cuatro
        // números parecieran necesitar una caja enorme.
        //
        // Sin línea que una los pasos. La llevaba, y era lo que obligaba a que
        // el bloque fuera ancho: el orden ya lo dice la lectura de izquierda a
        // derecha, así que la línea sólo ataba el diseño a un ancho mínimo.
        <div className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-3">
          {pasos.map((paso) => {
            const contenido = (
              <>
                <span
                  className={cn(
                    "text-2xl font-semibold tabular-nums",
                    paso.alerta
                      ? "text-destructive"
                      : Number(paso.valor) === 0
                        ? "text-muted-foreground/50"
                        : "text-primary",
                  )}
                >
                  {paso.valor}
                </span>
                <span className="mt-0.5 text-xs leading-tight text-muted-foreground">
                  {paso.etiqueta}
                </span>
              </>
            );

            return paso.href ? (
              <Link
                key={paso.etiqueta}
                href={paso.href}
                className={cn(
                  "-mx-1 flex flex-col rounded-lg px-1 py-0.5 transition-colors",
                  paso.alerta ? "hover:bg-destructive/10" : "hover:bg-primary/5",
                )}
              >
                {contenido}
              </Link>
            ) : (
              <div key={paso.etiqueta} className="flex flex-col px-1 py-0.5">
                {contenido}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
