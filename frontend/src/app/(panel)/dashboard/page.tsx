"use client";

import { ComponentType, useEffect, useState } from "react";
import { Bell, DollarSign, Package, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, Overview, ShipmentsAnalytics } from "@/lib/api";
import { STATUS_LABELS, TYPE_LABELS } from "@/lib/shipment-status";
import { Skeleton } from "@/components/ui/skeleton";

function Kpi({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="glass-card group relative overflow-hidden rounded-2xl p-5 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
          <Icon className="size-5" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-primary">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [shipments, setShipments] = useState<ShipmentsAnalytics | null>(null);

  useEffect(() => {
    Promise.all([
      api<Overview>("/analytics/overview"),
      api<ShipmentsAnalytics>("/analytics/shipments"),
    ])
      .then(([o, s]) => {
        setOverview(o);
        setShipments(s);
      })
      .catch((err) =>
        toast.error(
          err instanceof ApiError ? err.message : "Error cargando analítica",
        ),
      );
  }, []);

  if (!overview || !shipments) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  const maxDaily = Math.max(1, ...shipments.daily.map((d) => d.count));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Últimos 30 días</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi
          title="Envíos"
          value={String(overview.shipments.total)}
          hint={`${overview.shipments.delivered} entregados`}
          icon={Package}
        />
        <Kpi
          title="Tasa de entrega"
          value={`${(overview.shipments.deliveryRate * 100).toFixed(1)}%`}
          hint={`${overview.shipments.failed} intentos fallidos`}
          icon={TrendingUp}
        />
        <Kpi
          title="COD cobrado"
          value={overview.cod.collected}
          hint={`Pendiente: ${overview.cod.pending} · Remitido: ${overview.cod.remitted}`}
          icon={DollarSign}
        />
        <Kpi
          title="Notificaciones"
          value={String(overview.notifications.sent)}
          hint={`${overview.notifications.failed} fallidas`}
          icon={Bell}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass-panel rounded-2xl p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-primary">
              Envíos por día
            </h2>
            <span className="rounded-full bg-white/60 px-2.5 py-0.5 text-xs font-medium text-primary ring-1 ring-black/5">
              máx {maxDaily}
            </span>
          </div>
          {shipments.daily.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              Sin envíos en el rango.
            </p>
          ) : (
            <div className="mt-6 flex h-44 items-end gap-1.5">
              {shipments.daily.map((d) => (
                <div
                  key={d.date}
                  className="group relative flex-1"
                  title={`${d.date}: ${d.count}`}
                >
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-primary/70 to-primary shadow-[0_2px_8px_-2px_rgba(4,21,31,0.4)] transition-opacity hover:opacity-90"
                    style={{
                      height: `${Math.max((d.count / maxDaily) * 176, 4)}px`,
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-base font-semibold text-primary">Por estado</h2>
          <div className="mt-4 flex flex-col gap-2">
            {shipments.byStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos.</p>
            ) : (
              shipments.byStatus.map((row) => (
                <div
                  key={row.status}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-foreground/80">
                    {STATUS_LABELS[row.status] ?? row.status}
                  </span>
                  <span className="font-semibold text-primary">
                    {row.count}
                  </span>
                </div>
              ))
            )}
            {shipments.byType.length > 0 ? (
              <div className="mt-3 border-t border-border/70 pt-3">
                {shipments.byType.map((row) => (
                  <div
                    key={row.type}
                    className="flex items-center justify-between text-sm text-muted-foreground"
                  >
                    <span>{TYPE_LABELS[row.type] ?? row.type}</span>
                    <span>{row.count}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
