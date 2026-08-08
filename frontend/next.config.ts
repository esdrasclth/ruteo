import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
