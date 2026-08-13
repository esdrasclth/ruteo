"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, ExternalLink, PackageX, Truck } from "lucide-react";
import {
  API_URL,
  LegStatus,
  MapPoint,
  PublicTracking,
  PublicTrackingLeg,
} from "@/lib/api";
import {
  STATUS_LABELS,
  TYPE_LABELS,
  statusBadgeClass,
} from "@/lib/shipment-status";
import {
  CUSTOMS_STATUS_LABELS,
  customsStatusBadgeClass,
  EVENT_TYPE_LABELS,
  legModeLabel,
} from "@/lib/logistics";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// maplibre-gl pesa ~200 KB comprimidos y solo hace falta cuando el envío tiene
// geometría. Fuera del bundle inicial: esta página la abre gente en el móvil,
// muchas veces con mala señal, y lo primero que quiere leer es el estado.
const ShipmentMap = dynamic(
  () => import("@/components/shipment-map").then((m) => m.ShipmentMap),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[340px] w-full rounded-xl" />,
  },
);

const LEG_STATUS_LABELS: Record<LegStatus, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En curso",
  COMPLETED: "Completado",
};

function legStatusBadgeClass(status: LegStatus): string {
  switch (status) {
    case "COMPLETED":
      return "bg-primary text-primary-foreground";
    case "IN_PROGRESS":
      return "bg-accent text-accent-foreground";
    case "PENDING":
      return "bg-muted text-muted-foreground";
  }
}

function fecha(iso: string) {
  return new Date(iso).toLocaleString("es-HN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function lugar(p: { label: string | null; country: string | null }) {
  return [p.label, p.country].filter(Boolean).join(", ") || "—";
}

function RouteMap({
  path,
  legs,
}: {
  path: MapPoint[];
  legs: PublicTrackingLeg[];
}) {
  if (path.length < 2) return null;
  const W = 640;
  const H = 200;
  const PAD_X = 34;
  const PAD_Y = 40;
  const lats = path.map((p) => p.lat);
  const lngs = path.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const x = (lng: number) =>
    maxLng === minLng
      ? W / 2
      : PAD_X + ((lng - minLng) / (maxLng - minLng)) * (W - PAD_X * 2);
  const y = (lat: number) =>
    maxLat === minLat
      ? H / 2
      : H - PAD_Y - ((lat - minLat) / (maxLat - minLat)) * (H - PAD_Y * 2);
  const points = path.map((p) => ({ ...p, cx: x(p.lng), cy: y(p.lat) }));
  const ultimo = points.length - 1;

  // `mapPath` se arma tramo a tramo, así que con N tramos hay N+1 puntos. Solo
  // cuando esa relación se cumple se puede situar el paquete sobre la ruta; si
  // no cuadra se dibuja todo el trayecto por igual en vez de inventar un avance.
  const alineado = legs.length > 0 && points.length === legs.length + 1;
  const actual = alineado
    ? Math.min(legs.filter((l) => l.status === "COMPLETED").length, ultimo)
    : ultimo;

  // Etiquetas que no se pisan: se reservan el origen y la posición actual, y un
  // punto intermedio solo entra si queda separado. Con escalas dispares (Doral y
  // Miami a 7 km, Tegucigalpa a 1500) los rótulos caían uno encima de otro.
  const SEP = 62;
  const visibles: number[] = [];
  const cabe = (i: number) =>
    visibles.every((j) => Math.abs(points[j].cx - points[i].cx) >= SEP);
  for (const i of [actual, 0, ...points.map((_, i) => i)]) {
    if (!visibles.includes(i) && cabe(i)) visibles.push(i);
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Trayecto: ${path.map((p) => p.label ?? "punto").join(" a ")}`}
    >
      {/* Todo el trayecto en punteado tenue y, encima, el tramo ya recorrido en
          sólido. Cuando no se puede deducir el avance, `actual` es el final y la
          ruta queda sólida entera. */}
      <polyline
        points={points.map((p) => `${p.cx},${p.cy}`).join(" ")}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeOpacity="0.25"
        strokeDasharray="5 5"
      />
      {actual > 0 ? (
        <polyline
          points={points
            .slice(0, actual + 1)
            .map((p) => `${p.cx},${p.cy}`)
            .join(" ")}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : null}
      {points.map((p, i) => {
        const esActual = i === actual;
        return (
          <g key={`${p.lat}-${p.lng}-${i}`}>
            {esActual ? (
              <circle
                cx={p.cx}
                cy={p.cy}
                r={11}
                fill="var(--primary)"
                opacity="0.12"
              />
            ) : null}
            <circle
              cx={p.cx}
              cy={p.cy}
              r={esActual ? 5.5 : 4}
              fill={esActual ? "var(--primary)" : "var(--card)"}
              stroke="var(--primary)"
              strokeWidth="2"
              strokeOpacity={i > actual ? 0.45 : 1}
            />
            {p.label && visibles.includes(i) ? (
              <text
                x={p.cx}
                y={p.cy - 16}
                textAnchor="middle"
                className="fill-foreground text-[10px] font-medium"
              >
                {p.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function Marca() {
  return (
    <Link href="/track" className="flex w-fit items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-white/10 text-white ring-1 ring-white/15">
        <Truck className="size-4" />
      </span>
      <span className="font-semibold tracking-wide text-white">Ruteo</span>
    </Link>
  );
}

function Seccion({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-card rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-primary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function PublicTrackingPage({
  params,
}: {
  params: Promise<{ trackingNumber: string }>;
}) {
  const { trackingNumber } = use(params);
  const [data, setData] = useState<PublicTracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Sin WebGL el mapa no arranca; el SVG de siempre queda como red de seguridad
  // para que la página pública siga sirviendo en equipos viejos.
  const [mapaFallo, setMapaFallo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_URL}/tracking/${encodeURIComponent(trackingNumber)}`,
        );
        if (!res.ok) {
          if (!cancelled)
            setError(
              res.status === 404
                ? "No encontramos ese número de rastreo."
                : "No se pudo cargar el rastreo.",
            );
          return;
        }
        const body = (await res.json()) as PublicTracking;
        if (!cancelled) setData(body);
      } catch {
        if (!cancelled) setError("No se pudo cargar el rastreo.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackingNumber]);

  const guia = decodeURIComponent(trackingNumber);
  // La tarjeta flotante solo aparece si tiene algo que enseñar; en un envío
  // local sin tramos ni coordenadas, una caja vacía sobre el hero sobra.
  const hayMapa = (data?.mapPath.length ?? 0) >= 2;
  const flotante = Boolean(data && (hayMapa || data.currentLeg));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="brand-dark px-4 pb-24 pt-8 sm:px-8">
        <div className="relative z-10 mx-auto max-w-4xl">
          <div className="flex items-center justify-between gap-4">
            <Marca />
            <Link
              href="/track"
              className="inline-flex items-center gap-1.5 rounded text-sm text-white/55 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#56b3a5]"
            >
              <ArrowLeft className="size-4" />
              Otra guía
            </Link>
          </div>

          <div className="mt-8">
            <p className="font-mono text-sm tracking-wider text-white/50">
              {guia}
            </p>

            {error ? (
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                No encontramos este envío
              </h1>
            ) : !data ? (
              <Skeleton className="mt-3 h-9 w-72 bg-white/10" />
            ) : (
              <>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white text-balance sm:text-4xl">
                  {STATUS_LABELS[data.status]}
                </h1>
                <p className="mt-3 text-sm text-white/60">
                  {lugar(data.origin)}
                  <span className="mx-2 text-white/30">→</span>
                  {lugar(data.destination)}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80 ring-1 ring-white/12">
                    {TYPE_LABELS[data.type]}
                  </span>
                  {data.estimatedDelivery ? (
                    <span className="rounded-full bg-[#56b3a5]/15 px-3 py-1 text-xs font-medium text-[#7fd3c4] ring-1 ring-[#56b3a5]/25">
                      Entrega estimada: {fecha(data.estimatedDelivery)}
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* relative z-10: el filtro de marca del hero es un ::after absoluto y se
          pintaba por encima de la tarjeta que sube a solaparlo, ocultándole la
          primera franja de contenido. */}
      <main className="panel-surface relative z-10 flex-1 px-4 pb-16 sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          {/* Se monta sobre el borde del hero, igual que la tarjeta clara de
              login: mantiene el gesto de capas entre las dos pantallas. */}
          {flotante && data ? (
            <div className="glass-card -mt-16 rounded-2xl p-6">
              {data.currentLeg ? (
                <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-medium text-primary">
                    Tramo {legModeLabel(data.currentLeg.mode).toLowerCase()} en
                    curso
                  </span>
                  <span className="text-muted-foreground">
                    {data.currentLeg.originLabel ?? "—"} →{" "}
                    {data.currentLeg.destinationLabel ?? "—"}
                  </span>
                  <Badge
                    className={`ml-auto ${legStatusBadgeClass(data.currentLeg.status)}`}
                  >
                    {LEG_STATUS_LABELS[data.currentLeg.status]}
                  </Badge>
                </div>
              ) : null}
              {hayMapa ? (
                mapaFallo ? (
                  <RouteMap path={data.mapPath} legs={data.legs} />
                ) : (
                  <ShipmentMap
                    path={data.mapPath}
                    legs={data.legs}
                    onError={() => setMapaFallo(true)}
                  />
                )
              ) : null}
            </div>
          ) : (
            <div className="pt-8" />
          )}

          {error ? (
            <div className="glass-card flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/8 text-primary/70 ring-1 ring-primary/10">
                <PackageX className="size-5" />
              </span>
              <div className="space-y-1">
                <p className="font-medium text-foreground">{error}</p>
                <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                  Revisa que el número esté completo. Tiene el formato{" "}
                  <span className="font-mono">RUT-</span> seguido de 10
                  caracteres.
                </p>
              </div>
              <Link
                href="/track"
                className="mt-1 rounded text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Probar con otra guía
              </Link>
            </div>
          ) : !data ? (
            <>
              <Skeleton className="h-48 rounded-2xl" />
              <Skeleton className="h-64 rounded-2xl" />
            </>
          ) : (
            <>
              {data.customs ? (
                <Seccion
                  title="Aduana"
                  action={
                    <Badge
                      className={customsStatusBadgeClass(data.customs.status)}
                    >
                      {CUSTOMS_STATUS_LABELS[data.customs.status]}
                    </Badge>
                  }
                >
                  <dl className="flex flex-col gap-2.5 text-sm">
                    {data.customs.totalCharges ? (
                      <div className="flex items-baseline justify-between gap-4">
                        <dt className="text-muted-foreground">
                          Cargos de importación
                        </dt>
                        <dd className="font-semibold tabular-nums text-primary">
                          {data.customs.totalCharges} {data.customs.currency}
                        </dd>
                      </div>
                    ) : null}
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">Liberación</dt>
                      <dd className="text-right font-medium">
                        {data.customs.clearedAt
                          ? fecha(data.customs.clearedAt)
                          : "Pendiente"}
                      </dd>
                    </div>
                  </dl>
                </Seccion>
              ) : null}

              {data.legs.length > 0 ? (
                <Seccion title="Trayecto">
                  <ol className="flex flex-col gap-2.5">
                    {data.legs.map((leg) => (
                      <li
                        key={leg.sequence}
                        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/70 bg-card/60 p-3.5 text-sm"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/8 text-xs font-medium tabular-nums text-primary">
                          {leg.sequence}
                        </span>
                        <span className="font-medium">
                          {legModeLabel(leg.mode)}
                        </span>
                        <span className="text-muted-foreground">
                          {leg.originLabel ?? "—"} →{" "}
                          {leg.destinationLabel ?? "—"}
                        </span>
                        <Badge className={legStatusBadgeClass(leg.status)}>
                          {LEG_STATUS_LABELS[leg.status]}
                        </Badge>
                        {leg.carrier ? (
                          <span className="text-xs text-muted-foreground">
                            {leg.carrier}
                          </span>
                        ) : null}
                        {leg.externalTrackingUrl ? (
                          <a
                            href={leg.externalTrackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                          >
                            Ver en {leg.carrier ?? "el transportista"}
                            <ExternalLink className="size-3" />
                          </a>
                        ) : null}
                        {leg.etaAt ? (
                          <span className="ml-auto text-xs text-muted-foreground">
                            Estimado: {fecha(leg.etaAt)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </Seccion>
              ) : null}

              <Seccion title="Historial">
                <ol className="relative ml-1 border-l border-border">
                  {[...data.timeline].reverse().map((ev, i) => (
                    <li
                      key={`${ev.occurredAt}-${i}`}
                      className="mb-5 ml-5 last:mb-0"
                    >
                      {/* El hito más reciente va relleno y con halo; los
                          anteriores, huecos. */}
                      <span
                        className={`absolute -left-[5.5px] mt-1.5 size-2.5 rounded-full ${
                          i === 0
                            ? "bg-primary ring-4 ring-primary/12"
                            : "bg-card ring-2 ring-primary/35"
                        }`}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        {/* No todo hito que ve el cliente es un cambio de
                            estado: «liberado de aduana» y «pago recibido» no lo
                            son, y antes de la fase 0.2 no se podían ni
                            registrar. */}
                        {ev.status ? (
                          <Badge className={statusBadgeClass(ev.status)}>
                            {STATUS_LABELS[ev.status]}
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            {EVENT_TYPE_LABELS[ev.eventType]}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {fecha(ev.occurredAt)}
                        </span>
                      </div>
                      {ev.description ? (
                        <p className="mt-1.5 text-sm">{ev.description}</p>
                      ) : null}
                      {/* `ev.importe` no se pinta: la descripción ya trae la
                          cifra y repetirla debajo se lee como si fueran dos
                          cobros. Va en la API porque un integrador prefiere un
                          número con su moneda a tener que sacarlo de un texto. */}
                      {ev.locationLabel ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {ev.locationLabel}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </Seccion>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
