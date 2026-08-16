"use client";

import { useSyncExternalStore } from "react";
import { slugActual } from "./tenant";

/**
 * El subdominio no cambia mientras la pestaña viva: navegar dentro del panel
 * no cambia de host, y cambiar de empresa es una navegación de origen entera
 * que vuelve a montar la aplicación. Así que no hay a qué suscribirse.
 */
function sinCambios(): () => void {
  return () => {};
}

function enElServidor(): null {
  return null;
}

function siempreResuelto(): boolean {
  return true;
}

function nuncaResuelto(): boolean {
  return false;
}

/**
 * El slug de la empresa según el subdominio de la pestaña.
 *
 * `resuelto` distingue "todavía no lo sé" de "no hay". Hace falta porque el
 * subdominio solo existe en el navegador y estas pantallas también se
 * renderizan en el servidor: si se leyera en el render daría `null` allí y
 * `"enviospress"` aquí, y React avisaría de que el HTML servido no coincide
 * con el que produce el cliente. Sin la bandera habría que elegir entre
 * parpadear el mensaje de "entra por tu dirección" durante un instante o no
 * mostrarlo nunca.
 *
 * Esto era un `useState` + `useEffect` que hacía `setState` nada más montar
 * —un render de más por cada pantalla que preguntara por la empresa—.
 * `useSyncExternalStore` da lo mismo con una lectura para el servidor y otra
 * para el navegador, sin render intermedio.
 */
export function useSlugTenant(): { slug: string | null; resuelto: boolean } {
  const slug = useSyncExternalStore(sinCambios, slugActual, enElServidor);
  const resuelto = useSyncExternalStore(
    sinCambios,
    siempreResuelto,
    nuncaResuelto,
  );

  return { slug, resuelto };
}
