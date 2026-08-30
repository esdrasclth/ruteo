import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const root = ".next/static/chunks";
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
// MapLibre se carga en un chunk dinámico; mantenerlo bajo 1.1 MB evita que
// contamine el primer render sin convertir el mapa en una falsa alerta.
const MAX_CHUNK_BYTES = 1100 * 1024;

async function archivos(dir) {
  const entradas = await readdir(dir, { withFileTypes: true });
  const resultado = [];
  for (const entrada of entradas) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) resultado.push(...(await archivos(ruta)));
    else if (entrada.name.endsWith(".js")) resultado.push(ruta);
  }
  return resultado;
}

const chunks = await archivos(root);
const tamanos = await Promise.all(
  chunks.map(async (ruta) => ({ ruta, bytes: (await stat(ruta)).size })),
);
const total = tamanos.reduce((suma, chunk) => suma + chunk.bytes, 0);
const mayor = tamanos.reduce((a, b) => (a.bytes > b.bytes ? a : b));

if (total > MAX_TOTAL_BYTES || mayor.bytes > MAX_CHUNK_BYTES) {
  console.error(
    `Presupuesto excedido: ${(total / 1024 / 1024).toFixed(2)} MB total; ` +
      `chunk mayor ${(mayor.bytes / 1024).toFixed(0)} KB.`,
  );
  process.exit(1);
}

console.log(
  `Presupuesto JS OK: ${(total / 1024 / 1024).toFixed(2)} MB total; ` +
    `chunk mayor ${(mayor.bytes / 1024).toFixed(0)} KB.`,
);
