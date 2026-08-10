import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empaqueta en `.next/standalone` solo lo que la aplicación necesita, con su
  // propio `server.js`. Sin esto, la imagen de producción tendría que llevar el
  // `node_modules` entero para poder ejecutar `next start`.
  output: "standalone",

  async redirects() {
    return [
      // El sitio público vive en otro proyecto (`../landing`) y en su propio
      // dominio. Aquí `/` ya no renderiza nada, así que se manda al panel; si
      // no hay sesión, su layout rebota a /login.
      { source: "/", destination: "/dashboard", permanent: false },
    ];
  },
};

export default nextConfig;
