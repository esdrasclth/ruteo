"use client";

import { Dispatch, SetStateAction, useState } from "react";

/**
 * La página de una lista, que vuelve a la primera cuando cambian los filtros.
 *
 * Antes esto era un efecto —`useEffect(() => setPage(1), [status, tipo])`— y es
 * el otro sabor de `react-hooks/set-state-in-effect`: no pide datos, pero
 * también pinta una vez con el valor viejo y otra con el nuevo.
 *
 * La forma correcta es ajustar el estado DURANTE el render, que es lo que
 * React documenta para «cambiar el estado cuando cambian los datos que
 * entran». React descarta la salida de ese render y vuelve a ejecutar el
 * componente con el valor ya corregido, así que nunca llega a pintarse la
 * página 3 de un filtro que ya no está puesto.
 *
 *     const [page, setPage] = usePagina(`${status}|${tipo}`);
 *
 * `filtros` es una cadena a propósito: se compara por valor, y así da igual
 * cuántos filtros haya ni de dónde vengan —estado local o parámetros de la URL.
 */
export function usePagina(
  filtros: string,
): [number, Dispatch<SetStateAction<number>>] {
  const [page, setPage] = useState(1);
  const [previos, setPrevios] = useState(filtros);

  if (previos !== filtros) {
    setPrevios(filtros);
    setPage(1);
  }

  return [page, setPage];
}
