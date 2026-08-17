"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

// Serie temporal de una sola métrica: área + curva. Una sola serie no lleva
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

/**
 * Convierte la serie en una curva suave (Hermite cúbica monótona, Fritsch–
 * Carlson) en vez de unir los puntos con segmentos rectos.
 *
 * **Monótona y no una spline cualquiera, y esa es toda la razón de las quince
 * líneas de tangentes.** Una Catmull-Rom o una Bézier con tangentes fijas se
 * pasa de largo al salir de un pico: entre un día de 40 y uno de 0 la curva
 * baja de 0 y dibuja envíos negativos, y entre dos días iguales se abomba como
 * si hubiera pasado algo el día de en medio. Aquí la tangente se anula en cada
 * cambio de dirección (`m[i-1] * m[i] <= 0`), así que la curva no se sale nunca
 * del intervalo de los dos días que une: no hay pico que la serie no tenga.
 */
function rutaSuave(puntos: { x: number; y: number }[]): string {
  const n = puntos.length;
  if (n === 0) return "";
  if (n === 1) return `M ${puntos[0].x},${puntos[0].y}`;

  const dx: number[] = [];
  const pendientes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = puntos[i + 1].x - puntos[i].x;
    dx.push(h);
    // Con dos días en la misma x el paso sería 0; no puede pasar porque las x
    // se reparten uniformemente, pero dividir por 0 aquí propagaría un NaN a
    // toda la ruta y la gráfica desaparecería sin dar un error.
    pendientes.push(h === 0 ? 0 : (puntos[i + 1].y - puntos[i].y) / h);
  }

  const tangentes: number[] = new Array(n);
  tangentes[0] = pendientes[0];
  tangentes[n - 1] = pendientes[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (pendientes[i - 1] * pendientes[i] <= 0) {
      tangentes[i] = 0;
    } else {
      const p1 = 2 * dx[i] + dx[i - 1];
      const p2 = dx[i] + 2 * dx[i - 1];
      tangentes[i] =
        (p1 + p2) / (p1 / pendientes[i - 1] + p2 / pendientes[i]);
    }
  }

  let d = `M ${puntos[0].x},${puntos[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i];
    d +=
      ` C ${puntos[i].x + h / 3},${puntos[i].y + (tangentes[i] * h) / 3}` +
      ` ${puntos[i + 1].x - h / 3},${puntos[i + 1].y - (tangentes[i + 1] * h) / 3}` +
      ` ${puntos[i + 1].x},${puntos[i + 1].y}`;
  }
  return d;
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

  const linea = useMemo(() => rutaSuave(puntos), [puntos]);
  // El área cierra la MISMA curva contra la base, en vez de ser un polígono
  // aparte: si se trazaran por separado, el relleno seguiría los segmentos
  // rectos y asomaría por fuera de la curva en cada valle.
  const area =
    puntos.length > 1
      ? `${linea} L ${puntos[puntos.length - 1].x},${PAD.top + PLOT_H} L ${
          puntos[0].x
        },${PAD.top + PLOT_H} Z`
      : "";

  // Reinicia las animaciones de entrada al cambiar de rango. React reaprovecha
  // el nodo si la `key` no cambia, y una animación CSS sólo corre al montar: sin
  // esto, la curva de «últimos 90 días» aparecería de golpe porque el `<path>`
  // es literalmente el mismo elemento que ya se dibujó para «últimos 7».
  const claveSerie = `${data.length}:${data[0]?.date ?? ""}`;

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
              {/* Tres paradas y no dos: con una sola caída lineal el relleno
                  se ve como un bloque de color que se corta, y con la parada
                  intermedia el degradado se apaga antes de llegar a la base y
                  el área se funde con la superficie del panel. */}
              {/* El relleno sale del paso CLARO de la marca (#3f9689) y no de
                  `--primary`. El primario es una tinta casi negra: rebajado al
                  20% sobre blanco pierde el poco tono que tiene y el área se
                  lee gris, como una sombra y no como la serie. El paso claro
                  mantiene el verde a cualquier opacidad, y es el mismo que ya
                  usan el CTA de acceso y el hero de la landing. */}
              <linearGradient id="ruteo-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3f9689" stopOpacity="0.3" />
                <stop offset="55%" stopColor="#3f9689" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#3f9689" stopOpacity="0" />
              </linearGradient>

              {/* La línea recorre la paleta de marca de izquierda a derecha:
                  la tinta al principio, el paso claro al final. Da profundidad
                  a un trazo de 2px sin añadir ni una petición ni un filtro. */}
              <linearGradient id="ruteo-linea" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#183a37" />
                <stop offset="100%" stopColor="#3f9689" />
              </linearGradient>
            </defs>

            {/* Rejilla punteada salvo la base. La sólida de lado a lado en
                cada tick competía con la propia serie —cinco líneas del mismo
                grosor que el dato—; punteada se lee como referencia y no como
                contenido. La base sí queda sólida: es el cero, y es contra lo
                que se mide todo lo de arriba. */}
            {ticksY.map((v) => {
              const y = PAD.top + PLOT_H - (v / maxY) * PLOT_H;
              const esBase = v === 0;
              return (
                <g key={v}>
                  <line
                    x1={PAD.left}
                    y1={y}
                    x2={ancho - PAD.right}
                    y2={y}
                    stroke="var(--border)"
                    strokeWidth={1}
                    strokeDasharray={esBase ? undefined : "2 5"}
                    strokeOpacity={esBase ? 1 : 0.85}
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
              <g key={claveSerie}>
                <path d={area} fill="url(#ruteo-area)" className="revela" />
                {/* Resplandor: la misma curva ancha y casi transparente por
                    debajo de la buena. Es lo que hace un `filter: blur` de SVG
                    pero sin filtro, que en una gráfica que se repinta al pasar
                    el ratón obliga al navegador a rasterizar de nuevo en cada
                    fotograma. */}
                <path
                  d={linea}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={6}
                  strokeOpacity={0.1}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className="revela"
                />
                <path
                  d={linea}
                  pathLength={1}
                  fill="none"
                  stroke="url(#ruteo-linea)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className="traza"
                />
              </g>
            ) : null}

            {/* El último día, siempre marcado. La serie termina donde estamos
                hoy, y sin un punto ahí la curva se queda cortada a media altura
                como si le faltaran datos por llegar. */}
            {puntos.length > 1 &&
            activo === null &&
            indiceMax !== puntos.length - 1 ? (
              <circle
                cx={puntos[puntos.length - 1].x}
                cy={puntos[puntos.length - 1].y}
                r={3.5}
                fill="#3f9689"
                stroke="var(--card)"
                strokeWidth={2}
                className="revela"
              />
            ) : null}

            {/* Etiqueta directa solo del extremo: un número por punto es ruido. */}
            {indiceMax >= 0 && puntos[indiceMax] && activo === null ? (
              <g className="revela">
                {/* Aro tenue alrededor: separa el punto de la curva sin subirle
                    el radio, que lo convertiría en un dato más de la serie. */}
                <circle
                  cx={puntos[indiceMax].x}
                  cy={puntos[indiceMax].y}
                  r={8}
                  fill="var(--primary)"
                  fillOpacity={0.12}
                />
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
                  y={puntos[indiceMax].y - 14}
                  textAnchor="middle"
                  className="fill-foreground text-[11px] font-semibold tabular-nums"
                >
                  {data[indiceMax].count}
                </text>
              </g>
            ) : null}

            {activoPunto ? (
              <>
                {/* Punteada y hasta el punto, no hasta el suelo: la vertical
                    sólida de lado a lado partía la gráfica en dos mitades y
                    pesaba más que la curva que se está leyendo. */}
                <line
                  x1={activoPunto.x}
                  y1={activoPunto.y}
                  x2={activoPunto.x}
                  y2={PAD.top + PLOT_H}
                  stroke="var(--primary)"
                  strokeWidth={1}
                  strokeOpacity={0.3}
                  strokeDasharray="3 3"
                />
                <circle
                  cx={activoPunto.x}
                  cy={activoPunto.y}
                  r={9}
                  fill="var(--primary)"
                  fillOpacity={0.14}
                />
                <circle
                  cx={activoPunto.x}
                  cy={activoPunto.y}
                  r={4.5}
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
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-border/60 bg-card/95 px-3 py-2 text-xs shadow-[0_2px_6px_rgba(4,21,31,0.06),0_16px_32px_-16px_rgba(4,21,31,0.35)] backdrop-blur-sm"
          style={{
            left: Math.min(Math.max(activoPunto.x, 60), ancho - 60),
            top: activoPunto.y - 14,
          }}
        >
          <p className="flex items-center gap-1.5 font-semibold text-foreground">
            {/* El punto repite el color de la serie. En una gráfica de una sola
                métrica no hace falta para saber de qué se habla, pero es lo que
                ata el globo a la curva en vez de dejarlo flotando. */}
            <span
              className="size-1.5 rounded-full bg-primary"
              aria-hidden
            />
            <span className="tabular-nums">{activoPunto.count}</span> {label}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            {longLabel(activoPunto.date)}
          </p>
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
