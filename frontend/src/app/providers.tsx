"use client";

import { ReactNode } from "react";
import { SWRConfig } from "swr";
import { conviveReintentar } from "@/lib/use-api";
import { ConfirmarProvider } from "@/components/confirmar";

/**
 * Política de caché de todo el panel, en un solo sitio.
 *
 * Está en el armazón raíz y no en el del panel a propósito: el rastreo público
 * y el alta también leen de la API, y una política por pantalla es como se
 * acaba con cinco políticas distintas sin que nadie lo haya decidido.
 *
 * Este componente es además el sitio donde entrará el `fallback` de datos
 * sembrados desde el servidor cuando el panel deje de llevar el token en
 * `localStorage`; los componentes que ya usan `useApi` no se enteran.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        // Al volver a la pestaña se refresca. En un panel de operación los
        // datos envejecen mientras no miras —un envío cambia de estado porque
        // el repartidor lo movió, no porque tú hicieras algo— y quedarse con
        // la foto de hace media hora es peor que una petición de más.
        revalidateOnFocus: true,
        // ...pero no en cada alt-tab. Sin esto, alguien que compara dos
        // ventanas dispara una tanda de peticiones por cada vistazo.
        focusThrottleInterval: 30_000,
        // Los cinco componentes del detalle del envío montan a la vez. Con
        // esta ventana, las peticiones que coincidan se sirven de una sola.
        dedupingInterval: 5_000,
        shouldRetryOnError: conviveReintentar,
        errorRetryCount: 2,
      }}
    >
      {/* La confirmación vive aquí y no en el armazón del panel porque también
          la necesitan las pantallas de plataforma. Solo monta un diálogo, que
          está cerrado mientras nadie pregunte nada. */}
      <ConfirmarProvider>{children}</ConfirmarProvider>
    </SWRConfig>
  );
}
