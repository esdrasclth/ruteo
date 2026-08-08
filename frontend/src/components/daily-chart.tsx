"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

// Serie temporal de una sola métrica: área + línea. Una sola serie no lleva
// leyenda (el título ya dice qué se grafica) y el color es secuencial —
// el primario de marca, no una paleta categórica.
const PLOT_H = 168;
const PAD = { top: 14, right: 14, bottom: 26, left: 34 };
const HEIGHT = PLOT_H + PAD.top + PAD.bottom;

// "2026-07-27" partido a mano: new Date("2026-07-27") lo interpreta como UTC y
// en zonas al oeste corre la etiqueta un día hacia atrás.
function parseDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shortLabel(iso: string) {
  return parseDay(iso).toLocaleDateString("es-HN", {
    day: "numeric",
    month: "short",
  });
}

function longLabel(iso: string) {
  return parseDay(iso).toLocaleDateString("es-HN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// Techo redondeado para que los ticks caigan en números limpios (0/2/4, 0/25/50)
// en vez de en el máximo crudo de la serie.
function niceMax(max: number) {
  if (max <= 4) return Math.max(max, 1);
  const pot = Math.pow(10, Math.floor(Math.log10(max)));
  for (const paso of [1, 2, 2.5, 5, 10]) {
    const candidato = paso * pot;
    if (candidato >= max) return candidato;
  }
  return 10 * pot;
}

export function DailyChart({
  data,
  label = "envíos",
}: {
  data: DailyPoint[];
  label?: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  const [activo, setActivo] = useState<number | null>(null);

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setAncho(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxY = useMemo(
    () => niceMax(Math.max(1, ...data.map((d) => d.count))),
    [data],
  );

  const plotW = Math.max(0, ancho - PAD.left - PAD.right);

  const puntos = useMemo(() => {
    if (plotW <= 0 || data.length === 0) return [];
    // Con un solo día el divisor sería 0: se ancla al centro del área de trazado.
    const paso = data.length > 1 ? plotW / (data.length - 1) : 0;
    return data.map((d, i) => ({
      ...d,
      x: PAD.left + (data.length > 1 ? i * paso : plotW / 2),
      y: PAD.top + PLOT_H - (d.count / maxY) * PLOT_H,
    }));
  }, [data, plotW, maxY]);

  const linea = puntos.map((p) => `${p.x},${p.y}`).join(" ");
  const area =
    puntos.length > 0
      ? `${puntos[0].x},${PAD.top + PLOT_H} ${linea} ${
          puntos[puntos.length - 1].x
        },${PAD.top + PLOT_H}`
      : "";

  const ticksY = useMemo(() => {
    const paso = maxY <= 4 ? 1 : maxY / 4;
    const out: number[] = [];
    for (let v = 0; v <= maxY + 1e-9; v += paso) out.push(v);
    return out;
  }, [maxY]);

  // ~5 fechas repartidas: 30 etiquetas se pisan entre sí. Se interpolan entre el
  // primer y el último índice en vez de avanzar a saltos fijos y añadir el final
  // aparte, que dejaba las dos últimas etiquetas encimadas.
  const ticksX = useMemo(() => {
    const n = puntos.length;
    if (n === 0) return [];
    const deseados = Math.min(5, n);
    if (deseados === 1) return [0];
    return Array.from({ length: deseados }, (_, k) =>
      Math.round((k * (n - 1)) / (deseados - 1)),
    );
  }, [puntos]);

  const indiceMax = useMemo(() => {
    if (data.length === 0) return -1;
    let mejor = 0;
    data.forEach((d, i) => {
      if (d.count > data[mejor].count) mejor = i;
    });
    return data[mejor].count > 0 ? mejor : -1;
  }, [data]);

  const puntoDesdeEvento = useCallback(
    (clientX: number) => {
      const rect = contenedor.current?.getBoundingClientRect();
      if (!rect || puntos.length === 0) return null;
      const x = clientX - rect.left;
      let mejor = 0;
      puntos.forEach((p, i) => {
        if (Math.abs(p.x - x) < Math.abs(puntos[mejor].x - x)) mejor = i;
      });
      return mejor;
    },
    [puntos],
  );

  function onTeclado(e: React.KeyboardEvent) {
    if (puntos.length === 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const delta = e.key === "ArrowRight" ? 1 : -1;
      setActivo((prev) => {
        const base = prev ?? (delta > 0 ? -1 : puntos.length);
        return Math.min(puntos.length - 1, Math.max(0, base + delta));
      });
    } else if (e.key === "Escape") {
      setActivo(null);
    }
  }

  const activoPunto = activo !== null ? puntos[activo] : undefined;

  return (
    <div className="relative">
      <div
        ref={contenedor}
        tabIndex={0}
        role="img"
        aria-label={`Serie de ${label} por día. Máximo ${
          indiceMax >= 0 ? data[indiceMax].count : 0
        }. Use las flechas para recorrer los días.`}
        onKeyDown={onTeclado}
        onMouseMove={(e) => setActivo(puntoDesdeEvento(e.clientX))}
        onMouseLeave={() => setActivo(null)}
        onBlur={() => setActivo(null)}
        className="w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {ancho > 0 ? (
          <svg
            width={ancho}
            height={HEIGHT}
            className="overflow-visible"
            aria-hidden
          >
            <defs>
              <linearGradient id="ruteo-area" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--primary)"
                  stopOpacity="0.16"
                />
                <stop
                  offset="100%"
                  stopColor="var(--primary)"
                  stopOpacity="0.01"
                />
              </linearGradient>
            </defs>

            {/* Rejilla: hairline sólida, un paso por encima de la superficie. */}
            {ticksY.map((v) => {
              const y = PAD.top + PLOT_H - (v / maxY) * PLOT_H;
              return (
                <g key={v}>
                  <line
                    x1={PAD.left}
                    y1={y}
                    x2={ancho - PAD.right}
                    y2={y}
                    stroke="var(--border)"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 8}
                    y={y}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-muted-foreground text-[10px] tabular-nums"
                  >
                    {v}
                  </text>
                </g>
              );
            })}

            {ticksX.map((i) => (
              <text
                key={puntos[i].date}
                x={puntos[i].x}
                y={PAD.top + PLOT_H + 16}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {shortLabel(puntos[i].date)}
              </text>
            ))}

            {puntos.length > 1 ? (
              <>
                <polygon points={area} fill="url(#ruteo-area)" />
                <polyline
                  points={linea}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </>
            ) : null}

            {/* Etiqueta directa solo del extremo: un número por punto es ruido. */}
            {indiceMax >= 0 && puntos[indiceMax] && activo === null ? (
              <>
                <circle
                  cx={puntos[indiceMax].x}
                  cy={puntos[indiceMax].y}
                  r={4}
                  fill="var(--primary)"
                  stroke="var(--card)"
                  strokeWidth={2}
                />
                <text
                  x={puntos[indiceMax].x}
                  y={puntos[indiceMax].y - 12}
                  textAnchor="middle"
                  className="fill-foreground text-[11px] font-semibold tabular-nums"
                >
                  {data[indiceMax].count}
                </text>
              </>
            ) : null}

            {activoPunto ? (
              <>
                <line
                  x1={activoPunto.x}
                  y1={PAD.top}
                  x2={activoPunto.x}
                  y2={PAD.top + PLOT_H}
                  stroke="var(--primary)"
                  strokeWidth={1}
                  strokeOpacity={0.35}
                />
                <circle
                  cx={activoPunto.x}
                  cy={activoPunto.y}
                  r={4}
                  fill="var(--primary)"
                  stroke="var(--card)"
                  strokeWidth={2}
                />
              </>
            ) : null}
          </svg>
        ) : (
          <div style={{ height: HEIGHT }} />
        )}
      </div>

      {activoPunto ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border/70 bg-card px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: Math.min(Math.max(activoPunto.x, 60), ancho - 60),
            top: activoPunto.y - 10,
          }}
        >
          <p className="font-medium text-foreground">
            {activoPunto.count} {label}
          </p>
          <p className="text-muted-foreground">{longLabel(activoPunto.date)}</p>
        </div>
      ) : null}

      {/* Gemelo en tabla: el tooltip nunca puede ser la única vía al dato. */}
      <table className="sr-only">
        <caption>{`Detalle de ${label} por día`}</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th scope="row">{longLabel(d.date)}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
