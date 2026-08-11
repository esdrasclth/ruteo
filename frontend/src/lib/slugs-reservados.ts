/**
 * Copia de `backend/src/common/tenant-host.ts`. **La fuente de verdad es esa**:
 * la del backend es la que impide registrar estos nombres, y esta solo sirve
 * para que el panel sepa que un host como `panel.ruteo.brandsofts.com` no es
 * ninguna empresa.
 *
 * **Por qué está duplicada.** El panel y la API son dos paquetes npm distintos,
 * sin nada compartido entre medias. Montar un paquete común para una lista de
 * palabras cuesta más de lo que resuelve; lo que sí hay que hacer es tocar las
 * dos cuando se añada un host nuevo bajo el dominio.
 *
 * **Qué pasa si se desincronizan.** Si aquí falta un nombre que sí sea un host
 * de verdad, el panel de ese host cree ser una empresa que no existe y el login
 * responde «credenciales inválidas» con la contraseña buena —que es exactamente
 * el fallo que esta lista viene a arreglar—. Si sobra un nombre, esa empresa no
 * podría entrar por su subdominio… pero tampoco pudo registrarse con él, porque
 * la lista del backend se lo impidió al darse de alta.
 */
export const SLUGS_RESERVADOS: ReadonlySet<string> = new Set([
  // 1. Hosts del propio sistema
  "api",
  "panel",
  "app",
  "www",
  "admin",
  "plataforma",
  "platform",
  "auth",
  "login",
  "track",
  "rastreo",
  "ruteo",
  "dokploy",
  "traefik",

  // 2. Infraestructura y correo
  "mail",
  "email",
  "correo",
  "smtp",
  "imap",
  "pop",
  "mx",
  "ns",
  "ns1",
  "ns2",
  "dns",
  "ftp",
  "cdn",
  "static",
  "assets",
  "media",
  "files",
  "postmaster",
  "hostmaster",
  "webmaster",
  "abuse",
  "noreply",
  "no-reply",

  // 3. Apariencia de oficialidad
  "security",
  "seguridad",
  "soporte",
  "support",
  "help",
  "ayuda",
  "docs",
  "status",
  "blog",
  "billing",
  "facturacion",
  "pagos",
  "checkout",
  "cuenta",
  "account",
  "root",
  "system",
  "internal",
  "test",
  "demo",
  "dev",
  "staging",
  "beta",
  "webhook",
  "webhooks",
]);

export function esSlugReservado(slug: string): boolean {
  return SLUGS_RESERVADOS.has(slug.toLowerCase());
}
