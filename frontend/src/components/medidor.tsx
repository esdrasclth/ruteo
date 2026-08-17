import { cn } from "@/lib/utils";

/**
 * Rampa de un solo tono: es la paleta de marca (hue 172°) recorrida de la tinta
 * al paso más claro que ya usan el CTA de acceso y el hero de la landing.
 *
 * **No es una paleta categórica y no debe convertirse en una.** Las bodegas no
 * tienen un color propio ni significan nada distinto entre sí; lo único que
 * hace falta es poder separar un tramo del de al lado. Con tonos de la misma
 * familia eso se consigue sin meter en el panel un solo color que no sea de la
 * marca —que es exactamente lo que pasa en cuanto alguien mete un azul y un
 * naranja «para que se distingan mejor»—.
 */
const RAMPA = ["#183a37", "#2c5f59", "#3f9689", "#56b3a5", "#7cc9be"];

/**
 * Barra de proporción para acompañar una cifra que ya está escrita al lado.
 *
 * Va `aria-hidden` sin excepción: **no aporta ni un dato que no esté ya en
 * texto**. Es una segunda lectura del mismo número para el ojo, que compara
 * longitudes mucho más rápido que dígitos; anunciarla otra vez sólo repetiría
 * la cifra con menos precisión.
 */
export function Medidor({
  /** De 0 a 1. Se recorta a ese rango: un 1.02 desbordaría la pista. */
  proporcion,
  alerta,
  retraso = 0,
  className,
}: {
  proporcion: number;
  /** Pinta el relleno en rojo de marca: lo que mide es un problema. */
  alerta?: boolean;
  /** Milisegundos de espera, para escalonar una fila de medidores. */
  retraso?: number;
  className?: string;
}) {
  const acotada = Number.isFinite(proporcion)
    ? Math.min(1, Math.max(0, proporcion))
    : 0;

  return (
    <div
      aria-hidden
      className={cn("medidor h-1 w-full overflow-hidden rounded-full", className)}
    >
      <div
        className={cn(
          "medidor-relleno crece h-full rounded-full",
          alerta && "medidor-alerta",
        )}
        style={
          {
            width: `${acotada * 100}%`,
            "--retraso": `${retraso}ms`,
          } as React.CSSProperties
        }
      />
    </div>
  );
}

export interface Tramo {
  clave: string;
  valor: number;
  /** Para el `title` del tramo, que es lo único que lo identifica al pasar. */
  etiqueta: string;
  alerta?: boolean;
}

/**
 * La misma barra, repartida entre varios tramos: cuánto de un total está en
 * cada sitio.
 *
 * Los tramos se dimensionan con `flex-grow` y no con anchos en porcentaje. Con
 * porcentajes hay que redondear cada tramo por su cuenta y la suma se queda en
 * 99.7% o se pasa a 100.4%, que en una barra de 300px se ve como un hueco al
 * final o como un tramo cortado. Repartiendo el ancho, la fila siempre cierra
 * exacta y el `min-width` de abajo garantiza que un tramo de un solo bulto se
 * siga viendo en vez de desaparecer a medio píxel.
 */
export function MedidorApilado({
  tramos,
  retraso = 0,
  className,
}: {
  tramos: Tramo[];
  retraso?: number;
  className?: string;
}) {
  const visibles = tramos.filter((t) => t.valor > 0);
  if (visibles.length === 0) return null;

  return (
    <div
      aria-hidden
      className={cn(
        "medidor crece flex h-1.5 w-full gap-px overflow-hidden rounded-full",
        className,
      )}
      style={{ "--retraso": `${retraso}ms` } as React.CSSProperties}
    >
      {visibles.map((tramo, i) => (
        <div
          key={tramo.clave}
          title={`${tramo.etiqueta}: ${tramo.valor}`}
          className="h-full transition-[flex-grow] duration-500"
          style={{
            flexGrow: tramo.valor,
            flexBasis: 0,
            minWidth: 3,
            backgroundColor: tramo.alerta
              ? "var(--destructive)"
              : RAMPA[i % RAMPA.length],
          }}
        />
      ))}
    </div>
  );
}
