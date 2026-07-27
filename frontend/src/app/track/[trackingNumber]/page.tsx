"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { API_URL, LegStatus, MapPoint, PublicTracking } from "@/lib/api";
import { STATUS_LABELS, TYPE_LABELS, statusBadgeClass } from "@/lib/shipment-status";
import { CUSTOMS_STATUS_LABELS, customsStatusBadgeClass } from "@/lib/logistics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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

function RouteMap({ path }: { path: MapPoint[] }) {
  if (path.length < 2) return null;
  const W = 640;
  const H = 220;
  const PAD = 28;
  const lats = path.map((p) => p.lat);
  const lngs = path.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const x = (lng: number) =>
    maxLng === minLng
      ? W / 2
      : PAD + ((lng - minLng) / (maxLng - minLng)) * (W - PAD * 2);
  const y = (lat: number) =>
    maxLat === minLat
      ? H / 2
      : H - PAD - ((lat - minLat) / (maxLat - minLat)) * (H - PAD * 2);
  const points = path.map((p) => ({ ...p, cx: x(p.lng), cy: y(p.lat) }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-md border bg-muted/30"
      role="img"
      aria-label="Trayecto del envío"
    >
      <polyline
        points={points.map((p) => `${p.cx},${p.cy}`).join(" ")}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeDasharray="6 4"
      />
      {points.map((p, i) => (
        <g key={`${p.lat}-${p.lng}-${i}`}>
          <circle
            cx={p.cx}
            cy={p.cy}
            r={i === points.length - 1 ? 6 : 4}
            fill={i === points.length - 1 ? "var(--primary)" : "white"}
            stroke="var(--primary)"
            strokeWidth="2"
          />
          {p.label ? (
            <text
              x={p.cx}
              y={p.cy - 10}
              textAnchor="middle"
              className="fill-foreground"
              fontSize="10"
            >
              {p.label}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
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

  return (
    <div className="min-h-screen bg-muted/40 p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/track">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-mono text-xl font-semibold">
              {decodeURIComponent(trackingNumber)}
            </h1>
            <p className="text-sm text-muted-foreground">
              Rastreo público de envío
            </p>
          </div>
        </div>

        {error ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              {error}
            </CardContent>
          </Card>
        ) : !data ? (
          <>
            <Skeleton className="h-32" />
            <Skeleton className="h-64" />
          </>
        ) : (
          <>
            <Card>
              <CardContent className="flex flex-col gap-3 pt-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={statusBadgeClass(data.status)}>
                    {STATUS_LABELS[data.status]}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {TYPE_LABELS[data.type]}
                  </span>
                  {data.estimatedDelivery ? (
                    <span className="ml-auto text-sm">
                      ETA:{" "}
                      {new Date(data.estimatedDelivery).toLocaleString(
                        "es-HN",
                      )}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm">
                  <span className="text-muted-foreground">De </span>
                  {[data.origin.label, data.origin.country]
                    .filter(Boolean)
                    .join(", ") || "—"}
                  <span className="text-muted-foreground"> a </span>
                  {[data.destination.label, data.destination.country]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </p>
                {data.currentLeg ? (
                  <p className="text-sm text-muted-foreground">
                    Tramo actual: {data.currentLeg.mode} ·{" "}
                    {data.currentLeg.originLabel ?? "—"} →{" "}
                    {data.currentLeg.destinationLabel ?? "—"} (
                    {LEG_STATUS_LABELS[data.currentLeg.status]})
                  </p>
                ) : null}
                <RouteMap path={data.mapPath} />
              </CardContent>
            </Card>

            {data.customs ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Aduana</CardTitle>
                    <Badge
                      className={customsStatusBadgeClass(data.customs.status)}
                    >
                      {CUSTOMS_STATUS_LABELS[data.customs.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {data.customs.totalCharges
                    ? `Cargos: ${data.customs.totalCharges} ${data.customs.currency}. `
                    : null}
                  {data.customs.clearedAt
                    ? `Liberado el ${new Date(
                        data.customs.clearedAt,
                      ).toLocaleString("es-HN")}.`
                    : "Aún no liberado."}
                </CardContent>
              </Card>
            ) : null}

            {data.legs.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tramos</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {data.legs.map((leg) => (
                    <div
                      key={leg.sequence}
                      className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"
                    >
                      <Badge variant="outline">#{leg.sequence}</Badge>
                      <span className="font-medium">{leg.mode}</span>
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
                          className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                        >
                          Rastreo del carrier
                          <ExternalLink className="size-3" />
                        </a>
                      ) : null}
                      {leg.etaAt ? (
                        <span className="ml-auto text-xs text-muted-foreground">
                          ETA: {new Date(leg.etaAt).toLocaleString("es-HN")}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Historial</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="relative ml-3 border-l border-border">
                  {[...data.timeline].reverse().map((ev, i) => (
                    <li key={`${ev.occurredAt}-${i}`} className="mb-5 ml-5">
                      <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-primary" />
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={statusBadgeClass(ev.status)}>
                          {STATUS_LABELS[ev.status]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(ev.occurredAt).toLocaleString("es-HN")}
                        </span>
                      </div>
                      {ev.description ? (
                        <p className="mt-1 text-sm">{ev.description}</p>
                      ) : null}
                      {ev.locationLabel ? (
                        <p className="text-xs text-muted-foreground">
                          {ev.locationLabel}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
