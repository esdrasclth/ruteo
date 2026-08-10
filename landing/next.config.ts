import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Igual que en el panel: `.next/standalone` con su `server.js`, para que la
  // imagen no cargue con el `node_modules` completo.
  output: "standalone",
};

export default nextConfig;
