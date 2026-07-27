"use client";

import { ComponentType, useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Bell, DollarSign, Package, TrendingUp } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  api,
  ApiError,
  DriversAnalytics,
  Overview,
  PaymentsAnalytics,
  ShipmentsAnalytics,
} from "@/lib/api";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_TYPE_LABELS,
  paymentStatusBadgeClass,
} from "@/lib/logistics";
import { STATUS_LABELS, TYPE_LABELS } from "@/lib/shipment-status";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RANGOS = [
  { dias: 7, label: "Últimos 7 días" },
  { dias: 30, label: "Últimos 30 días" },
  { dias: 90, label: "Últimos 90 días" },
];

// Cada KPI es un enlace a la lista que lo explica: ver "12 entregados" y no
// poder abrir esos 12 es el tipo de callejon sin salida que hace sentir el
// panel como modulos sueltos.
function Kpi({
  title,
  value,
  hint,
  icon: Icon,
  href,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="glass-card group relative overflow-hidden rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-24px_rgba(4,21,31,0.45)]"
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
          <Icon className="size-5" />
        </span>
      </div>
      <p className="mt-4 flex items-baseline gap-1.5 text-3xl font-semibold tracking-tight text-primary">
        {value}
        <ArrowUpRight className="size-4 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </Link>
  );
}

export default function DashboardPage() {
  const [dias, setDias] = useState("30");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [shipments, setShipments] = useState<ShipmentsAnalytics | null>(null);
  const [payments, setPayments] = useState<PaymentsAnalytics | null>(null);
  const [drivers, setDrivers] = useState<DriversAnalytics | null>(null);

  const load = useCallback(async () => {
    const desde = new Date();
    desde.setDate(desde.getDate() - Number(dias));
    const qs = `?from=${desde.toISOString()}`;

    setOverview(null);
    try {
      const [o, s, p, d] = await Promise.all([
        api<Overview>(`/analytics/overview${qs}`),
        api<ShipmentsAnalytics>(`/analytics/shipments${qs}`),
        api<PaymentsAnalytics>(`/analytics/payments${qs}`),
        api<DriversAnalytics>(`/analytics/drivers${qs}`),
      ]);
      setOverview(o);
      setShipments(s);
      setPayments(p);
      setDrivers(d);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error cargando analítica",
      );
    }
  }, [dias]);

  useEffect(() => {
    load();
  }, [load]);

  if (!overview || !shipments || !payments || !drivers) {
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
      <PageHeader
        title="Dashboard"
        description={RANGOS.find((r) => String(r.dias) === dias)?.label}
        actions={
          <Select value={dias} onValueChange={setDias}>
            <SelectTrigger className="w-48" aria-label="Rango de fechas">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGOS.map((r) => (
                <SelectItem key={r.dias} value={String(r.dias)}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi
          title="Envíos"
          value={String(overview.shipments.total)}
          hint={`${overview.shipments.delivered} entregados`}
          icon={Package}
          href="/shipments"
        />
        <Kpi
          title="Tasa de entrega"
          value={`${(overview.shipments.deliveryRate * 100).toFixed(1)}%`}
          hint={`${overview.shipments.failed} intentos fallidos`}
          icon={TrendingUp}
          href="/shipments?status=DELIVERED"
        />
        <Kpi
          title="COD cobrado"
          value={overview.cod.collected}
          hint={`Pendiente: ${overview.cod.pending} · Remitido: ${overview.cod.remitted}`}
          icon={DollarSign}
          href="/payments"
        />
        <Kpi
          title="Notificaciones"
          value={String(overview.notifications.sent)}
          hint={`${overview.notifications.failed} fallidas`}
          icon={Bell}
          href="/notifications"
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
                <Link
                  key={row.status}
                  href={`/shipments?status=${row.status}`}
                  className="-mx-2 flex items-center justify-between rounded-lg px-2 py-1 text-sm transition-colors hover:bg-primary/5"
                >
                  <span className="text-foreground/80">
                    {STATUS_LABELS[row.status] ?? row.status}
                  </span>
                  <span className="font-semibold text-primary">
                    {row.count}
                  </span>
                </Link>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-base font-semibold text-primary">
            Pagos por tipo y estado
          </h2>
          {payments.breakdown.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Sin pagos en el rango.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {payments.breakdown.map((row) => (
                <div
                  key={`${row.type}-${row.status}`}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-foreground/80">
                      {PAYMENT_TYPE_LABELS[row.type]}
                    </span>
                    <Badge className={paymentStatusBadgeClass(row.status)}>
                      {PAYMENT_STATUS_LABELS[row.status]}
                    </Badge>
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="text-xs text-muted-foreground">
                      {row.count}
                    </span>
                    <span className="font-semibold text-primary">
                      {row.amount}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-base font-semibold text-primary">
            COD por repartidor
          </h2>
          {drivers.drivers.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Ningún repartidor registró cobros en el rango. El COD que se cobra
              solo al marcar entregado no queda asignado a nadie.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {[...drivers.drivers]
                .sort((a, b) => Number(b.codAmount) - Number(a.codAmount))
                .map((row) => (
                  <div
                    key={row.driverId ?? "sin-driver"}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-foreground/80">
                      {row.name ?? "Sin nombre"}
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="text-xs text-muted-foreground">
                        {row.codCount} cobro{row.codCount === 1 ? "" : "s"}
                      </span>
                      <span className="font-semibold text-primary">
                        {row.codAmount}
                      </span>
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
