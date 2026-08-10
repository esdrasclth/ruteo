"use client";

import { useCallback, useState } from "react";

/**
 * Contador para volver a lanzar una carga bajo demanda.
 *
 * El patrón en las pantallas es: el efecto hace la petición y se limpia solo,
 * y tras guardar algo hay que refrescar la lista. Antes eso se hacía con un
 * `load` en `useCallback` que el efecto llamaba y los formularios también;
 * el problema es que ese `load` seguía vivo después de desmontar y pintaba
 * respuestas que ya no correspondían a los filtros vigentes.
 *
 * Aquí la recarga es una dependencia más del efecto, así que pasa por su
 * limpieza igual que un cambio de filtro.
 *
 *     const [recarga, recargar] = useRecarga();
 *     useEffect(() => { ... }, [recarga]);
 */
export function useRecarga(): [number, () => void] {
  const [n, setN] = useState(0);
  return [n, useCallback(() => setN((v) => v + 1), [])];
}
