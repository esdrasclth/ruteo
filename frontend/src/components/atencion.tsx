import Link from "next/link";
import { ArrowRight, CheckCircle2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Pendiente {
  /** Cuántos hay. Si es 0 no se dibuja: ver el porqué en el componente. */
  cuantos: number;
  /** En singular y plural, porque «1 excepciones» se lee como un fallo. */
  uno: string;
  varios: string;
  href: string;
}

/**
 * La franja de lo que necesita atención.
 *
 * **Sólo dibuja lo que está en rojo.** Antes esto eran cuatro cifras fijas, y
 * tres de ellas normalmente valían cero: la pantalla dedicaba su sitio más caro
 * —lo primero que se ve— a decir que no pasa nada, tres veces. Peor aún, los
 * ceros se dibujaban igual que los problemas, así que había que leer los cuatro
 * números para encontrar el que no era cero.
 *
 * Cuando no hay nada pendiente se colapsa a UNA línea. Un tablero que grita
 * todos los días deja de leerse; uno que sólo grita cuando pasa algo se mira.
 *
 * No lleva icono por cifra ni tarjeta por cifra a propósito: aquí lo que importa
 * es el conjunto —«hay tres cosas que atender»— y no comparar unas con otras,
 * que es para lo que sirve una rejilla de tarjetas.
 */
export function Atencion({
  pendientes,
  detalle,
  className,
}: {
  pendientes: Pendiente[];
  /** Desglose corto, p. ej. las severidades de las excepciones. */
  detalle?: React.ReactNode;
  className?: string;
}) {
  const activos = pendientes.filter((p) => p.cuantos > 0);

  if (activos.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-2xl border border-primary/15 bg-primary/[0.04] px-4 py-3",
          className,
        )}
      >
        <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />
        <p className="text-sm text-foreground/80">
          Nada pendiente de atender ahora mismo.
        </p>
      </div>
    );
  }

  const total = activos.reduce((n, p) => n + p.cuantos, 0);

  return (
    <div
      className={cn(
        "rounded-2xl border border-destructive/25 bg-destructive/[0.04] p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive ring-1 ring-destructive/15">
          <TriangleAlert className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground/85">
            {total} cosa{total === 1 ? "" : "s"} que atender
          </p>

          {/* Cada trozo es su propio enlace: el número y lo que es van juntos y
              llevan al sitio donde se resuelve. Un resumen que sólo informa
              obliga a buscar a mano lo que acaba de señalar. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-2">
            {activos.map((p, i) => (
              <span key={p.href} className="flex items-baseline gap-1">
                {/* Alineado por la línea base y no por el centro: centrado, el
                    punto quedaba flotando a media altura entre un número de 18px
                    y un texto de 14px, y se leía como un carácter suelto. */}
                {i > 0 && (
                  <span className="mr-1 text-muted-foreground/40" aria-hidden>
                    ·
                  </span>
                )}
                <Link
                  href={p.href}
                  className="group inline-flex items-baseline gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-destructive/10"
                >
                  <span className="text-lg font-semibold tabular-nums text-destructive">
                    {p.cuantos}
                  </span>
                  <span className="text-sm text-foreground/75 group-hover:text-foreground">
                    {p.cuantos === 1 ? p.uno : p.varios}
                  </span>
                  <ArrowRight
                    className="size-3 self-center text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </Link>
              </span>
            ))}
          </div>

          {detalle ? <div className="mt-3">{detalle}</div> : null}
        </div>
      </div>
    </div>
  );
}
