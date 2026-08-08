// Dominio público de la landing. Lo necesita el marcado JSON-LD, que exige
// URLs absolutas: un `@id` relativo no identifica nada y el logo con ruta
// relativa no se puede resolver desde fuera del sitio.
//
// Igual que `NEXT_PUBLIC_APP_URL`, se incrusta en tiempo de build.

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3003"
).replace(/\/+$/, "");
