// MapLibre 6 arranca los tiles en un module worker que Turbopack no resuelve
// desde node_modules. Se sirve desde /public, y este script mantiene la copia
// sincronizada con la versión instalada para que no quede obsoleta al
// actualizar la dependencia. Corre solo en `postinstall`.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origen = join(raiz, "node_modules", "maplibre-gl", "dist");
const destino = join(raiz, "public");

// El worker importa el chunk compartido por ruta relativa, así que los dos
// tienen que quedar juntos en la raíz de /public.
const archivos = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

mkdirSync(destino, { recursive: true });
for (const archivo of archivos) {
  copyFileSync(join(origen, archivo), join(destino, archivo));
  console.log(`maplibre: ${archivo} -> public/`);
}
