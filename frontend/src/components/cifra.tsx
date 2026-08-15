import { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * La pieza de cifra de la pantalla de inicio: un número, su etiqueta, su icono
 * y —casi siempre— el enlace a la pantalla donde se actúa sobre él.
 *
 * Es UNA sola pieza para las dos mitades de «Inicio» a propósito. Antes había
 * dos: las cifras del «ahora» eran cajas con borde metidas dentro de tarjetas
 * con título, y las del período tarjetas de vidrio con el icono en un chip.
 * Siendo el mismo objeto dibujado de dos maneras, la juntura entre las dos
 * mitades no se leía como un cambio de sección sino como un cambio de pantalla.
 *
 * De ahí sale la regla de la pantalla, que conviene no romper al añadir bloques:
 * **una cifra nunca va dentro de otra tarjeta**. Lo que agrupa cifras es un
 * encabezado de texto; las tarjetas quedan para lo que no es una cifra —listas
 * y gráficas—.
 *
 * El icono es obligatorio, y no por adorno: en cuanto una cifra se queda sin él
 * la fila deja de cuadrar con las de al lado, que es exactamente el desajuste
 * que esta pieza viene a cerrar.
 */
export function Cifra({
  etiqueta,
  valor,
  nota,
  icono: Icono,
  href,
  alerta,
}: {
  etiqueta: string;
  valor: number | string;
  nota?: ReactNode;
  icono: ComponentType<{ className?: string }>;
  /** A dónde se va a hacer algo con esta cifra. Sin él, la tarjeta no es un enlace. */
  href?: string;
  /** Pinta la cifra en rojo: hay algo parado que alguien tiene que mirar. */
  alerta?: boolean;
}) {
  const contenido = (
    <>
      <div className="flex items-start justify-between gap-3">
        {/* Dos líneas reservadas siempre. Sin esto la etiqueta más larga de la
            fila empuja su número más abajo que el de al lado, y una fila de
            cifras que no arranca a la misma altura se lee torcida aunque las
            tarjetas sí estén alineadas. Una etiqueta que no quepa en dos líneas
            es una etiqueta que hay que acortar, no un caso que resolver aquí. */}
        <span className="min-h-8 text-xs font-medium uppercase leading-4 tracking-wider text-muted-foreground">
          {etiqueta}
        </span>
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl ring-1",
            alerta
              ? "bg-destructive/10 text-destructive ring-destructive/15"
              : "bg-primary/10 text-primary ring-primary/10",
          )}
        >
          <Icono className="size-5" aria-hidden />
        </span>
      </div>
      <p
        className={cn(
          "mt-4 flex items-baseline gap-1.5 text-3xl font-semibold tracking-tight tabular-nums",
          alerta ? "text-destructive" : "text-primary",
        )}
      >
        {valor}
        {href ? (
          <ArrowUpRight
            className="size-4 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        ) : null}
      </p>
      {nota ? <p className="mt-1 text-xs text-muted-foreground">{nota}</p> : null}
    </>
  );

  // `h-full` y no la altura natural: el elemento de la rejilla se estira, pero
  // si la tarjeta no lo hace, las de una misma fila acaban a distinta altura en
  // cuanto una lleva nota y la de al lado no.
  const clases = cn(
    "glass-card flex h-full flex-col rounded-2xl p-5",
    alerta && "ring-1 ring-destructive/20",
  );

  // Cada cifra lleva a donde se actúa sobre ella. Un tablero que sólo informa
  // obliga a buscar a mano lo que acaba de señalar.
  return href ? (
    <Link
      href={href}
      className={cn(
        clases,
        "group relative overflow-hidden transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-24px_rgba(4,21,31,0.45)]",
      )}
    >
      {contenido}
    </Link>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}

/**
 * Encabezado de un grupo de cifras. Sustituye a la tarjeta con título que antes
 * las envolvía: agrupa igual, pero sin meter una caja dentro de otra.
 *
 * Va en frase y no en mayúsculas para no competir con las etiquetas de las
 * cifras, que sí son versalitas; y por debajo del `h2` de la mitad («Ahora»,
 * «En el período»), que es quien manda en la jerarquía.
 */
export function GrupoCifras({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-semibold text-foreground/75">{titulo}</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}
