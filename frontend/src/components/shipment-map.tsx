"use client";

import { useEffect, useRef } from "react";
import type { Map as MlMap } from "maplibre-gl";
import type { MapPoint, PublicTrackingLeg } from "@/lib/api";
import {
  COLOR_MARCA as MARCA,
  ESTILO_MAPA as ESTILO,
  cargarMapLibre,
  recolorearAMarca,
} from "@/lib/map-style";
import "maplibre-gl/dist/maplibre-gl.css";

type Segmento = {
  from: MapPoint;
  to: MapPoint;
  mode: string;
  completado: boolean;
};

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

// Círculo máximo: es la ruta real que sigue un avión y, proyectada en Mercator,
// produce la curva que la gente ya reconoce de los rastreadores de vuelos. Una
// recta entre Miami y Tegucigalpa sería geográficamente falsa.
function arcoGeodesico(a: MapPoint, b: MapPoint, n = 72): [number, number][] {
  const lat1 = rad(a.lat);
  const lon1 = rad(a.lng);
  const lat2 = rad(b.lat);
  const lon2 = rad(b.lng);
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );
  if (!d || !Number.isFinite(d)) return [[a.lng, a.lat]];

  const puntos: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    puntos.push([
      deg(Math.atan2(y, x)),
      deg(Math.atan2(z, Math.sqrt(x * x + y * y))),
    ]);
  }
  return puntos;
}

function geometria(s: Segmento): [number, number][] {
  return s.mode === "AIR"
    ? arcoGeodesico(s.from, s.to)
    : [
        [s.from.lng, s.from.lat],
        [s.to.lng, s.to.lat],
      ];
}

// Se prefieren los tramos porque cada uno sabe su modo de transporte (y por
// tanto si va en arco o en recta). `mapPath` es el plan B cuando los tramos no
// traen coordenadas propias.
function construirSegmentos(
  path: MapPoint[],
  legs: PublicTrackingLeg[],
): { segmentos: Segmento[]; puntos: MapPoint[]; actual: number } {
  const conGeo = legs.filter((l) => l.origin && l.destination);

  if (conGeo.length > 0) {
    const completados = conGeo.filter((l) => l.status === "COMPLETED").length;
    const segmentos = conGeo.map((l, i) => ({
      from: { ...l.origin!, label: l.originLabel ?? l.origin!.label },
      to: { ...l.destination!, label: l.destinationLabel ?? l.destination!.label },
      mode: l.mode,
      completado: i < completados,
    }));
    const puntos = [segmentos[0].from, ...segmentos.map((s) => s.to)];
    return { segmentos, puntos, actual: Math.min(completados, puntos.length - 1) };
  }

  const segmentos = path.slice(0, -1).map((p, i) => ({
    from: p,
    to: path[i + 1],
    mode: "GROUND",
    completado: false,
  }));
  return { segmentos, puntos: path, actual: path.length - 1 };
}

export function ShipmentMap({
  path,
  legs,
  onError,
}: {
  path: MapPoint[];
  legs: PublicTrackingLeg[];
  onError?: () => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MlMap | null>(null);

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    let cancelado = false;

    (async () => {
      try {
        const maplibre = await cargarMapLibre();
        if (cancelado || !contenedor.current) return;

        const { segmentos, puntos, actual } = construirSegmentos(path, legs);
        if (segmentos.length === 0) return;

        const map = new maplibre.Map({
          container: contenedor.current,
          style: ESTILO,
          // El encuadre real lo pone fitBounds al cargar; esto solo evita el
          // salto desde el (0,0) del Atlántico.
          center: [puntos[0].lng, puntos[0].lat],
          zoom: 3,
          attributionControl: { compact: true },
          // Un mapa de rastreo se mira, no se explora: sin rotación y sin que
          // robe el scroll de la página al pasar por encima.
          dragRotate: false,
          scrollZoom: false,
        });
        mapa.current = map;

        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

        map.on("error", (e) => {
          // Un tile suelto que falle no debe tumbar la vista; solo se registra.
          console.warn("[mapa]", e?.error?.message ?? e);
        });

        map.on("load", () => {
          if (cancelado) return;
          recolorearAMarca(map);

          const hechos = segmentos.filter((s) => s.completado).map(geometria);
          const pendientes = segmentos
            .filter((s) => !s.completado)
            .map(geometria);

          const linea = (coords: [number, number][][]) =>
            ({
              type: "FeatureCollection" as const,
              features: coords.map((c) => ({
                type: "Feature" as const,
                properties: {},
                geometry: { type: "LineString" as const, coordinates: c },
              })),
            });

          map.addSource("ruta-pendiente", { type: "geojson", data: linea(pendientes) });
          map.addSource("ruta-hecha", { type: "geojson", data: linea(hechos) });

          map.addLayer({
            id: "ruta-pendiente",
            type: "line",
            source: "ruta-pendiente",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": MARCA,
              "line-width": 2,
              "line-opacity": 0.35,
              "line-dasharray": [2, 2],
            },
          });
          map.addLayer({
            id: "ruta-hecha",
            type: "line",
            source: "ruta-hecha",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": MARCA, "line-width": 3 },
          });

          // Marcadores como elementos del DOM: se estilan con la misma paleta
          // que el resto del panel y no hay que cargar iconos aparte.
          puntos.forEach((p, i) => {
            const esActual = i === actual;
            const el = document.createElement("div");
            el.className = "ruteo-pin" + (esActual ? " ruteo-pin-actual" : "");
            new maplibre.Marker({ element: el })
              .setLngLat([p.lng, p.lat])
              .setPopup(
                p.label
                  ? new maplibre.Popup({ offset: 14, closeButton: false }).setText(
                      p.label,
                    )
                  : undefined,
              )
              .addTo(map);
          });

          const bounds = puntos.reduce(
            (b, p) => b.extend([p.lng, p.lat] as [number, number]),
            new maplibre.LngLatBounds(
              [puntos[0].lng, puntos[0].lat],
              [puntos[0].lng, puntos[0].lat],
            ),
          );
          map.fitBounds(bounds, { padding: 64, maxZoom: 9, duration: 0 });
        });
      } catch (err) {
        // Sin WebGL (navegadores viejos, algunos Android de gama baja) MapLibre
        // no arranca: se avisa para que la vista caiga al mapa SVG.
        console.warn("[mapa] no se pudo inicializar", err);
        if (!cancelado) onError?.();
      }
    })();

    return () => {
      cancelado = true;
      mapa.current?.remove();
      mapa.current = null;
    };
    // Se monta una sola vez por envío: el rastreo público no muta en vivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={contenedor}
      className="h-[340px] w-full overflow-hidden rounded-xl border border-border/70"
      role="img"
      aria-label={`Mapa del trayecto: ${path
        .map((p) => p.label || "punto")
        .join(" a ")}`}
    />
  );
}
