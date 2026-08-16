"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getSessionRaw, parseSession, Session, SESSION_KEY } from "./api";
import {
  getPlatformSessionRaw,
  parsePlatformSession,
  PlatformSession,
} from "./platform-api";
import { EVENTO_SESION } from "./eventos";

/**
 * La sesión guardada, como fuente externa a la que React se suscribe.
 *
 * Antes esto era un `useState(null)` + `useEffect(() => setSession(getSession()))`,
 * que es lo que marcaba `react-hooks/set-state-in-effect`. El motivo del efecto
 * era legítimo —`localStorage` no existe en el servidor, y leerlo en el estado
 * inicial hacía que el HTML servido no coincidiera con el del cliente—, pero el
 * efecto no es la herramienta: obliga a un render de más, con la pantalla en
 * blanco por medio, cada vez que se monta el armazón.
 *
 * `useSyncExternalStore` es la herramienta que React da para exactamente esto:
 * una lectura para el servidor y otra para el navegador, sin render intermedio
 * y sin aviso de hidratación.
 *
 * Y de paso sale gratis algo que antes no había: como se suscribe al evento
 * `storage`, cerrar sesión en una pestaña se nota en TODAS. Antes, la otra
 * pestaña seguía pintando el panel hasta que alguien tocaba algo y le
 * respondían un 401.
 */
function suscribir(alCambiar: () => void): () => void {
  // `storage` avisa a las OTRAS pestañas; el evento propio, a esta.
  window.addEventListener("storage", alCambiar);
  window.addEventListener(EVENTO_SESION, alCambiar);
  return () => {
    window.removeEventListener("storage", alCambiar);
    window.removeEventListener(EVENTO_SESION, alCambiar);
  };
}

/** En el servidor no hay `localStorage`, y decirlo es la respuesta correcta. */
function enElServidor(): string | null {
  return null;
}

export interface EstadoSesion {
  sesion: Session | null;
  /**
   * Distingue «todavía no lo sé» de «no hay».
   *
   * Es `false` durante el render del servidor y el primero de hidratación. Sin
   * esta bandera habría que elegir entre parpadear la pantalla de entrada o no
   * mostrarla nunca.
   */
  resuelto: boolean;
}

export function useSesion(): EstadoSesion {
  const raw = useSyncExternalStore(suscribir, getSessionRaw, enElServidor);
  // El parseo se memoiza sobre la cadena: mismo texto, mismo objeto. Los
  // componentes que reciban `sesion` por props no se repintan de balde.
  const sesion = useMemo(() => parseSession(raw), [raw]);
  const resuelto = useSyncExternalStore(
    suscribir,
    () => true,
    () => false,
  );

  return { sesion, resuelto };
}

/** Solo el token, para los pocos sitios que arman un `fetch` a mano. */
export function useToken(): string | null {
  const { sesion } = useSesion();
  return sesion?.accessToken ?? null;
}

/**
 * Lo mismo para el panel de plataforma, que tiene su propia sesión y su propia
 * clave de almacenamiento —a propósito: ver la cabecera de `platform-api.ts`.
 */
export function usePlatformSesion(): {
  sesion: PlatformSession | null;
  resuelto: boolean;
} {
  const raw = useSyncExternalStore(
    suscribir,
    getPlatformSessionRaw,
    enElServidor,
  );
  const sesion = useMemo(() => parsePlatformSession(raw), [raw]);
  const resuelto = useSyncExternalStore(
    suscribir,
    () => true,
    () => false,
  );

  return { sesion, resuelto };
}

export { SESSION_KEY };
