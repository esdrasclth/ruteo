"use client";

import { useEffect, useRef } from "react";
import type { Map as MlMap } from "maplibre-gl";
import type { StopStatus } from "@/lib/api";
import {
  COLOR_MARCA,
  ESTILO_MAPA,
  cargarMapLibre,
  recolorearAMarca,
} from "@/lib/map-style";
import "maplibre-gl/dist/maplibre-gl.css";

export interface ParadaMapa {
  sequence: number;
  lat: number;
  lng: number;
  label: string | null;
  status: StopStatus;
}

// Mismo lenguaje que las insignias de la tabla de paradas, para que el mapa y la
// lista se lean como una sola cosa.
const COLOR_ESTADO: Record<StopStatus, string> = {
  PENDING: "#8aa19e",
  ARRIVED: "#c98a2b",
  COMPLETED: COLOR_MARCA,
  FAILED: "#b3261e",
};

export function StopsMap({
  paradas,
  carretera,
}: {
  paradas: ParadaMapa[];
  /** Geometría real por calles (OSRM). Si falta, se une con líneas rectas. */
  carretera?: [number, number][] | null;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MlMap | null>(null);

  // Firmas planas para las dependencias del efecto: `paradas` y `carretera` son
  // arrays nuevos en cada render y compararlos por referencia remontaría el mapa
  // continuamente.
  const firmaParadas = paradas
    .map((p) => `${p.sequence}:${p.lat},${p.lng}:${p.status}`)
    .join("|");
  const largoCarretera = carretera?.length ?? 0;

  useEffect(() => {
    if (!contenedor.current || mapa.current || paradas.length === 0) return;
    let cancelado = false;

    (async () => {
      try {
        const maplibre = await cargarMapLibre();
        if (cancelado || !contenedor.current) return;

        const map = new maplibre.Map({
          container: contenedor.current,
          style: ESTILO_MAPA,
          center: [paradas[0].lng, paradas[0].lat],
          zoom: 11,
          attributionControl: { compact: true },
          dragRotate: false,
          // Sin robar el scroll de la página: el mapa vive dentro de una lista
          // larga y hacer zoom al pasar por encima resulta hostil.
          scrollZoom: false,
        });
        mapa.current = map;
        map.addControl(
          new maplibre.NavigationControl({ showCompass: false }),
          "top-right",
        );

        map.on("load", () => {
          if (cancelado) return;
          recolorearAMarca(map);

          if (paradas.length > 1) {
            // Con geometría de OSRM la línea es el recorrido real por calles y
            // va sólida; sin ella solo se insinúa el orden, y por eso se dibuja
            // punteada: una recta sólida sugeriría un camino que no existe.
            const porCarretera = Boolean(carretera && carretera.length > 1);
            map.addSource("orden", {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: porCarretera
                    ? carretera!
                    : paradas.map((p) => [p.lng, p.lat] as [number, number]),
                },
              },
            });
            map.addLayer({
              id: "orden",
              type: "line",
              source: "orden",
              layout: { "line-cap": "round", "line-join": "round" },
              paint: porCarretera
                ? {
                    "line-color": COLOR_MARCA,
                    "line-width": 4,
                    "line-opacity": 0.75,
                  }
                : {
                    "line-color": COLOR_MARCA,
                    "line-width": 2,
                    "line-opacity": 0.5,
                    "line-dasharray": [2, 2],
                  },
            });
          }

          // El número de parada va dentro del marcador: en una ruta lo que se
          // consulta es el orden, no la posición absoluta.
          paradas.forEach((p) => {
            const el = document.createElement("div");
            el.className = "ruteo-parada";
            el.style.background = COLOR_ESTADO[p.status];
            el.textContent = String(p.sequence);
            new maplibre.Marker({ element: el })
              .setLngLat([p.lng, p.lat])
              .setPopup(
                new maplibre.Popup({ offset: 16, closeButton: false }).setText(
                  p.label ?? `Parada ${p.sequence}`,
                ),
              )
              .addTo(map);
          });

          const bounds = paradas.reduce(
            (b, p) => b.extend([p.lng, p.lat] as [number, number]),
            new maplibre.LngLatBounds(
              [paradas[0].lng, paradas[0].lat],
              [paradas[0].lng, paradas[0].lat],
            ),
          );
          map.fitBounds(bounds, { padding: 64, maxZoom: 14, duration: 0 });
        });
      } catch (err) {
        console.warn("[mapa de ruta] no se pudo inicializar", err);
      }
    })();

    return () => {
      cancelado = true;
      mapa.current?.remove();
      mapa.current = null;
    };
    // Se remonta cuando cambian las paradas (al optimizar el orden, por ejemplo)
    // o cuando llega la geometría de carretera, que viene en una segunda petición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaParadas, largoCarretera]);

  return (
    <div
      ref={contenedor}
      className="h-[320px] w-full overflow-hidden rounded-xl border border-border/70"
      role="img"
      aria-label={`Mapa con ${paradas.length} paradas de la ruta`}
    />
  );
}
