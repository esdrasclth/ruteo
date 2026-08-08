import type { Map as MlMap } from "maplibre-gl";

// Tiles vectoriales gratuitos de OpenFreeMap (OpenStreetMap + Planetiler): sin
// llave, sin cuenta y sin límite de peticiones. El día que se quiera dejar de
// depender de un tercero se auto-hospeda Protomaps y solo cambia esta constante.
export const ESTILO_MAPA = "https://tiles.openfreemap.org/styles/positron";

export const COLOR_MARCA = "#183a37";
export const COLOR_TINTA = "#04151f";

// MapLibre 6 descarga los tiles en un *module worker* que Turbopack no resuelve
// desde node_modules: el estilo y los sprites cargan bien, pero no se pide ni un
// tile y el evento `load` nunca llega — mapa gris y sin errores. Se sirve desde
// /public (ver scripts/copy-maplibre-worker.mjs, enganchado a postinstall).
export async function cargarMapLibre() {
  const maplibre = await import("maplibre-gl");
  maplibre.setWorkerUrl("/maplibre-gl-worker.mjs");
  return maplibre;
}

// Positron es gris neutro; esto lo lleva a la paleta de Ruteo sin escribir un
// estilo entero. Cada capa va en try/catch porque los ids del estilo pueden
// cambiar y una capa que no exista no debe romper el mapa.
export function recolorearAMarca(map: MlMap) {
  const capas = map.getStyle()?.layers ?? [];
  for (const capa of capas) {
    const id = capa.id;
    try {
      if (capa.type === "background") {
        map.setPaintProperty(id, "background-color", "#eef3f2");
      } else if (capa.type === "fill" && /water/i.test(id)) {
        map.setPaintProperty(id, "fill-color", "#cfe0dd");
      } else if (
        capa.type === "fill" &&
        /(landcover|park|wood|grass|forest)/i.test(id)
      ) {
        map.setPaintProperty(id, "fill-color", "#e3ebe9");
      } else if (
        capa.type === "fill" &&
        /(landuse|residential|building)/i.test(id)
      ) {
        map.setPaintProperty(id, "fill-color", "#e8eeed");
      } else if (capa.type === "line" && /boundary/i.test(id)) {
        map.setPaintProperty(id, "line-color", "#a8bfbb");
      } else if (
        capa.type === "line" &&
        /(road|transportation|bridge|tunnel)/i.test(id)
      ) {
        map.setPaintProperty(id, "line-color", "#dde5e4");
      } else if (capa.type === "symbol") {
        map.setPaintProperty(id, "text-color", COLOR_TINTA);
        map.setPaintProperty(id, "text-halo-color", "#eef3f2");
        map.setPaintProperty(id, "text-halo-width", 1.4);
      }
    } catch {
      // capa sin esa propiedad; se ignora
    }
  }
}
