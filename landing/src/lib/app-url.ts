// El panel y las pantallas de sesión viven en OTRO proyecto (`../frontend`) y,
// en producción, en otro dominio. Desde la landing hay que enlazarlos en
// absoluto: una ruta relativa como `/login` resolvería contra el dominio del
// sitio público, donde esa página no existe.
//
// `NEXT_PUBLIC_APP_URL` se incrusta en el bundle en tiempo de build, así que un
// cambio de dominio exige volver a construir la landing, no solo reiniciarla.

const BASE = (
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"
).replace(/\/+$/, "");

export function appUrl(ruta: string) {
  return `${BASE}${ruta}`;
}

export const APP = {
  track: appUrl("/track"),
  login: appUrl("/login"),
  register: appUrl("/register"),
  // Enterprise necesita conversación comercial, no otra cuenta de prueba. El
  // correo ya es el contacto operativo público del producto.
  sales:
    "mailto:soporte@brandsofts.com?subject=Quiero%20conocer%20Ruteo%20Enterprise",
} as const;
