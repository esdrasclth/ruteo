"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const DURACION = 750;

const CONSULTA = "(prefers-reduced-motion: reduce)";

function suscribir(alCambiar: () => void) {
  const mq = window.matchMedia(CONSULTA);
  mq.addEventListener("change", alCambiar);
  return () => mq.removeEventListener("change", alCambiar);
}

/**
 * Si el sistema pide menos movimiento.
 *
 * Con `useSyncExternalStore` y no con un `useState` + `useEffect`, que es el
 * camino corto y el equivocado: leer la preferencia en un efecto obliga a
 * pintar primero la versión animada y corregirla después —o sea, a animar una
 * vez a quien pidió que no se animara nada— y además mete un `setState`
 * síncrono dentro del efecto, que es lo que marca
 * `react-hooks/set-state-in-effect`. `matchMedia` es exactamente el «sistema
 * externo» para el que existe este hook.
 *
 * En el servidor devuelve `false`: no hay preferencia que leer, y `false` es la
 * respuesta que coincide con lo que el cliente encuentra en la mayoría de los
 * casos, así que es la que menos rehidrataciones provoca.
 */
function useMenosMovimiento() {
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  );
}

// Desaceleración cúbica: arranca rápido y frena al final. Un conteo lineal se
// lee como un contador de gasolinera; éste se lee como una cifra asentándose.
function suavizado(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Lleva un número desde donde estaba hasta `objetivo` en tres cuartos de
 * segundo.
 *
 * **Empieza en 0 y no en el valor final a propósito.** Este panel pinta sus
 * cifras cuando llegan los datos, así que el montaje del componente y la
 * llegada del dato son el mismo instante: contar desde cero es lo que convierte
 * «apareció un número» en «se midió algo».
 *
 * Al cambiar el rango de fechas NO vuelve a cero: `origen` guarda el último
 * fotograma pintado, así que la cifra viaja de la anterior a la nueva. Volver a
 * cero en cada cambio de rango sugeriría que el dato se perdió y se recalculó.
 */
export function useConteo(objetivo: number) {
  const menosMovimiento = useMenosMovimiento();
  const [animado, setAnimado] = useState(0);
  const origen = useRef(0);

  // Un NaN o un infinito no se animan: se plantan. Llegar aquí significa que el
  // dato venía mal, y una cuenta hacia NaN lo esconde en vez de enseñarlo.
  const animable = Number.isFinite(objetivo) && !menosMovimiento;

  useEffect(() => {
    if (!animable) return;
    const desde = origen.current;
    if (desde === objetivo) return;

    const inicio = performance.now();
    const salto = objetivo - desde;
    let id = 0;

    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / DURACION);
      const actual = t === 1 ? objetivo : desde + salto * suavizado(t);
      // El origen se mueve en CADA fotograma, no sólo al terminar: si el rango
      // cambia a mitad de la cuenta, la siguiente arranca donde se ve la cifra
      // ahora mismo y no donde arrancó la anterior, que daría un salto atrás.
      origen.current = actual;
      setAnimado(actual);
      if (t < 1) id = requestAnimationFrame(paso);
    };

    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [objetivo, animable]);

  // El caso «no se anima» se resuelve en el RENDER y no guardando el valor
  // final en el estado desde el efecto. Es la diferencia entre pintar la cifra
  // buena a la primera y pintar un 0 que se corrige en el siguiente render.
  return animable ? animado : objetivo;
}

/**
 * Una cifra que cuenta hasta su valor.
 *
 * Pinta DOS veces el número: el que se anima queda oculto a los lectores de
 * pantalla y al lado va el valor final en un `sr-only`. Sin esto, un lector
 * anunciaría el fotograma que pillara —«ochenta y tres» de un total de 128— o
 * se pelearía con las actualizaciones a 60 por segundo. El `sr-only` va
 * posicionado en absoluto, así que no descuadra el `tabular-nums` de al lado.
 */
export function Numero({
  valor,
  formato,
  className,
}: {
  valor: number;
  /** Cómo se escribe. Por defecto, entero. */
  formato?: (n: number) => string;
  className?: string;
}) {
  const animado = useConteo(valor);
  const escribir = formato ?? ((n: number) => String(Math.round(n)));

  return (
    <span className={className}>
      <span aria-hidden>{escribir(animado)}</span>
      <span className="sr-only">{escribir(valor)}</span>
    </span>
  );
}

/**
 * Dinero como lo escribe el resto del panel: dos decimales y sin símbolo, que
 * es lo que hace `claims` —el único sitio que ya lo formateaba—. Aquí hace
 * falta además porque el importe llega como cadena (`Decimal` de Prisma) y
 * animarlo obliga a pasar por número.
 */
export const comoDinero = (n: number) => n.toFixed(2);
