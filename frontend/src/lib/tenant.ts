/**
 * De qué empresa es esta pestaña: sale del subdominio, no de un campo.
 *
 * `enviospress.ruteo.brandsofts.com` -> `enviospress`
 * `panel.ruteo.brandsofts.com`       -> null (panel raíz: solo el alta)
 *
 * Esto NO es un control de seguridad. El slug viaja igual en el cuerpo de la
 * petición y quien quiera puede mandar otro; lo que decide de verdad a qué
 * empresa se entra es `resolveIdBySlug` en el backend, y a partir de ahí el
 * `tid` del JWT y el RLS de Postgres. Aquí solo se evita que el usuario tenga
 * que teclear el identificador de su empresa.
 */

import { esSlugReservado } from "./slugs-reservados";

/**
 * Dominio bajo el que cuelgan los paneles de empresa. Se incrusta en el bundle
 * al construir, como el resto de `NEXT_PUBLIC_*`: cambiarlo obliga a
 * reconstruir la imagen.
 */
const BASE = process.env.NEXT_PUBLIC_PANEL_BASE_HOST ?? "localhost";

export function slugDelHost(host: string): string | null {
  // `location.hostname` no trae puerto, pero la cabecera `Host` sí, y esta
  // función se usa desde los dos sitios.
  const limpio = host.replace(/:\d+$/, "").toLowerCase();

  const sufijo = `.${BASE.toLowerCase()}`;
  if (!limpio.endsWith(sufijo)) return null;

  const etiqueta = limpio.slice(0, -sufijo.length);

  // Una sola etiqueta y con el mismo juego de caracteres que exige el registro.
  // `a.b.ruteo…` no lo puede haber creado ningún alta, así que si aparece es
  // que alguien está probando cosas: mejor tratarlo como "sin empresa" que
  // mandar `a.b` al backend a ver qué pasa.
  if (!/^[a-z0-9-]+$/.test(etiqueta)) return null;

  // Los hosts del sistema no son empresas, y esto NO es un detalle estético.
  //
  // El panel raíz es `panel.<dominio>`, así que recortar el dominio deja
  // `panel`, que encaja con la regex de arriba. Sin esta comprobación, el panel
  // raíz se creía la empresa «panel» y mandaba `slug: "panel"` al login: el
  // backend no encuentra ninguna empresa con ese slug y responde «credenciales
  // inválidas» a gente que tecleaba su contraseña correcta. Ningún registro
  // puede haber creado estos slugs —`SLUGS_RESERVADOS` los rechaza al dar de
  // alta—, así que si aparecen aquí no son de nadie.
  if (esSlugReservado(etiqueta)) return null;

  return etiqueta;
}

/** El slug de la pestaña actual. `null` en el servidor y en el panel raíz. */
export function slugActual(): string | null {
  if (typeof window === "undefined") return null;
  return slugDelHost(window.location.hostname);
}
