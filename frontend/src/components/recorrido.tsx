import { ReactNode } from "react";
import Link from "next/link";
import { Medidor } from "@/components/medidor";
import { Numero } from "@/components/numero";
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
  retraso = 0,
}: {
  titulo: string;
  pasos: Paso[];
  /** Una cifra que acompaña pero no es parte del trayecto (p. ej. un KPI). */
  extra?: ReactNode;
  /** Qué decir cuando todos los pasos están en cero. */
  vacio: string;
  /**
   * Milisegundos de espera en la entrada, para escalonarlo con las tarjetas de
   * al lado. Es una prop y no un `<div>` envolviendo desde fuera porque esta
   * sección es un hijo directo de una rejilla: un envoltorio de por medio le
   * quitaría la altura de la fila y las tres tarjetas dejarían de medir igual.
   */
  retraso?: number;
}) {
  // Todo en cero: una línea, no cuatro ceros. Cuatro ceros del mismo tamaño que
  // las cifras de verdad ocupan un bloque entero para no decir nada, y es
  // exactamente lo que hacía que la pantalla se sintiera llena estando vacía.
  const todoCero = pasos.every((p) => Number(p.valor) === 0);

  // Referencia de las barras: el paso más cargado del trayecto, no la suma.
  // Con la suma, cuatro fases repartidas a partes iguales darían cuatro barras
  // al 25% —todas cortas, ninguna comparable—; contra el máximo, la fase donde
  // está atascada la carga llena la barra y las demás se leen contra ella, que
  // es la pregunta que se hace mirando esto.
  const tope = Math.max(1, ...pasos.map((p) => Number(p.valor) || 0));

  return (
    <section
      className="glass-card aparece flex flex-col rounded-2xl p-5"
      style={{ "--retraso": `${retraso}ms` } as React.CSSProperties}
    >
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
        // Cada paso reclama su parte del ancho (`flex-1`) en vez de ocupar sólo
        // lo que mide su número. El reparto que buscaba el `justify-between` de
        // antes sigue siendo el mismo —de ahí que se pueda quitar—, pero ahora
        // además cada paso TIENE un ancho propio, que es lo que necesita la
        // barra de abajo para significar algo: sin él, la barra del paso «7»
        // sería más corta que la del «112» por el ancho del texto y no por el
        // dato.
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-3">
          {pasos.map((paso, i) => {
            const cantidad = Number(paso.valor) || 0;
            const vacio = cantidad === 0;

            const contenido = (
              <>
                {typeof paso.valor === "number" ? (
                  <Numero
                    valor={paso.valor}
                    className={cn(
                      "text-2xl font-semibold tabular-nums",
                      paso.alerta
                        ? "text-destructive"
                        : vacio
                          ? "text-muted-foreground/50"
                          : "text-primary",
                    )}
                  />
                ) : (
                  <span
                    className={cn(
                      "text-2xl font-semibold tabular-nums",
                      paso.alerta ? "text-destructive" : "text-primary",
                    )}
                  >
                    {paso.valor}
                  </span>
                )}
                <span className="mt-0.5 text-xs leading-tight text-muted-foreground">
                  {paso.etiqueta}
                </span>
                {/* La barra sólo aparece si hay algo que medir. Una pista vacía
                    bajo un cero es una raya que no dice nada y que encima
                    sugiere que el dato se está cargando. */}
                {vacio ? null : (
                  <Medidor
                    proporcion={cantidad / tope}
                    alerta={paso.alerta}
                    retraso={i * 70}
                    className="mt-2"
                  />
                )}
              </>
            );

            return paso.href ? (
              <Link
                key={paso.etiqueta}
                href={paso.href}
                className={cn(
                  "-mx-1 flex min-w-16 flex-1 flex-col rounded-lg px-1 py-0.5 transition-colors",
                  paso.alerta ? "hover:bg-destructive/10" : "hover:bg-primary/5",
                )}
              >
                {contenido}
              </Link>
            ) : (
              <div
                key={paso.etiqueta}
                className="-mx-1 flex min-w-16 flex-1 flex-col px-1 py-0.5"
              >
                {contenido}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
