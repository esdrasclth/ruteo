/**
 * Avisos entre partes del panel que no son padre e hijo.
 *
 * El menú lateral vive en el layout y NO se vuelve a montar al navegar, así que
 * una pantalla que cambia algo que el menú pinta —la foto de perfil, el
 * nombre— no tiene forma de decírselo por props: no hay árbol que los una en
 * esa dirección.
 *
 * Un evento del navegador resuelve eso sin traer un gestor de estado entero
 * para dos datos. Si algún día son muchos más, la respuesta no es más eventos:
 * es un contexto de sesión de verdad.
 */

/** El perfil de quien ha entrado cambió: nombre o foto. */
export const EVENTO_PERFIL = "ruteo:perfil-cambiado";

export function avisarPerfilCambiado() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENTO_PERFIL));
  }
}

/**
 * La sesión guardada cambió: se entró, se refrescó el token o se salió.
 *
 * El navegador ya avisa de los cambios de `localStorage`, pero SOLO a las otras
 * pestañas: el evento `storage` no se dispara en la que escribió. Así que hace
 * falta este para que `useSesion` se entere en su propia pestaña.
 */
export const EVENTO_SESION = "ruteo:sesion-cambiada";

export function avisarSesionCambiada() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENTO_SESION));
  }
}
