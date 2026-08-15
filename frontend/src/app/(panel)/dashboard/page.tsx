"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, DollarSign, Package, TrendingUp } from "lucide-react";
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
import { TYPE_LABELS } from "@/lib/shipment-status";
import { Ahora } from "./ahora";
import { Badge } from "@/components/ui/badge";
import { Cifra } from "@/components/cifra";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { DailyChart } from "@/components/daily-chart";
import { cn } from "@/lib/utils";
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

// El KPI que vivía aquí se mudó a `@/components/cifra` y ahora lo comparten las
// dos mitades de la pantalla. Tenerlo suelto en este archivo es lo que dejó que
// la mitad de arriba se dibujara distinta sin que nadie lo notara al escribirla.

export default function DashboardPage() {
  const [dias, setDias] = useState("30");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [shipments, setShipments] = useState<ShipmentsAnalytics | null>(null);
  const [payments, setPayments] = useState<PaymentsAnalytics | null>(null);
  const [drivers, setDrivers] = useState<DriversAnalytics | null>(null);
  const [recargando, setRecargando] = useState(false);

  const load = useCallback(async () => {
    const desde = new Date();
    desde.setDate(desde.getDate() - Number(dias));
    const qs = `?from=${desde.toISOString()}`;

    // No se limpia el estado: al cambiar de rango se mantiene el render previo
    // atenuado (ver `recargando`). Vaciarlo devolvía la pantalla al skeleton y
    // el layout saltaba entero en cada cambio de filtro.
    setRecargando(true);
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
    } finally {
      setRecargando(false);
    }
  }, [dias]);

  useEffect(() => {
    load();
  }, [load]);

  // El skeleton cubre SOLO la mitad del período. Antes cortaba la pantalla
  // entera, y ahora eso escondería la mitad «Ahora» —que ya tiene sus datos y
  // es la que se atiende— mientras se descarga una gráfica que nadie está
  // esperando.
  const periodoListo = overview && shipments && payments && drivers;

  const maxDaily = periodoListo
    ? Math.max(0, ...shipments.daily.map((d) => d.count))
    : 0;
  const totalRango = periodoListo
    ? shipments.daily.reduce((acc, d) => acc + d.count, 0)
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inicio"
        description="Lo que está pasando ahora y cómo ha ido el período."
      />

      {/* La mitad de arriba: la foto del ahora. Va PRIMERO porque es sobre lo
          que se actúa hoy; el histórico se consulta, no se atiende. */}
      <Ahora />

      {/* Regla que nace y muere en transparente, no un borde de lado a lado: la
          línea dura cerraba la página en vez de separar dos secciones de la
          misma. Ahora que las dos mitades dibujan sus cifras igual, con esto y
          el aire de alrededor basta para marcar el cambio. */}
      <div className="mt-6 rule-fade" aria-hidden />

      {/* Cabecera de la segunda mitad. El selector de rango vive AQUÍ y no en
          la cabecera de la página: mandando sobre toda la pantalla parecería
          filtrar también las cifras de arriba, que no dependen de fechas, y esa
          confusión —dos bloques de números que parecen lo mismo y no cuadran—
          es justo la que se cargó la separación anterior en dos pantallas. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-primary">En el período</h2>
          <p className="text-sm text-muted-foreground">
            Volumen, cobros y notificaciones del rango elegido.
          </p>
        </div>
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
      </div>

      {!periodoListo ? (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        </div>
      ) : (
      // El atenuado al cambiar de rango envuelve SOLO esta mitad: la de arriba
      // no se recarga, así que oscurecerla sugeriría que también está cambiando.
      <div
        className={cn(
          "flex flex-col gap-6 transition-opacity duration-200",
          recargando && "opacity-60",
        )}
      >
      {/* Misma rejilla que los grupos de cifras de arriba (`GrupoCifras`), para
          que las columnas caigan en el mismo sitio al hacer scroll. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra
          etiqueta="Envíos"
          valor={overview.shipments.total}
          nota={`${overview.shipments.delivered} entregados`}
          icono={Package}
          href="/shipments"
        />
        <Cifra
          etiqueta="Tasa de entrega"
          valor={`${(overview.shipments.deliveryRate * 100).toFixed(1)}%`}
          nota={`${overview.shipments.failed} intentos fallidos`}
          icono={TrendingUp}
          href="/shipments?status=DELIVERED"
        />
        <Cifra
          etiqueta="COD cobrado"
          valor={overview.cod.collected}
          nota={`Pendiente: ${overview.cod.pending} · Remitido: ${overview.cod.remitted}`}
          icono={DollarSign}
          href="/payments"
        />
        <Cifra
          etiqueta="Notificaciones"
          valor={overview.notifications.sent}
          nota={`${overview.notifications.failed} fallidas`}
          icono={Bell}
          href="/notifications"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass-panel rounded-2xl p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-primary">
                Envíos por día
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {totalRango} en el período · máximo {maxDaily} en un día
              </p>
            </div>
          </div>
          <div className="mt-4">
            {shipments.daily.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin envíos en el rango.
              </p>
            ) : (
              <DailyChart data={shipments.daily} label="envíos" />
            )}
          </div>
        </div>

        {/* Aquí había además un desglose «Por estado» del rango. Se quitó al
            fusionar las dos pantallas: la mitad «Ahora» ya cuenta los envíos por
            estado, y en vivo. Tener los dos hacía que la misma pregunta —cuántos
            hay en cada estado— tuviera dos respuestas distintas en la misma
            pantalla, porque ésta filtraba por fecha de creación y la otra no. El
            desglose por TIPO sí se queda: es del período y no lo da nadie más. */}
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-base font-semibold text-primary">Por tipo</h3>
          <div className="mt-4 flex flex-col gap-2">
            {shipments.byType.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos.</p>
            ) : (
              shipments.byType.map((row) => (
                <Link
                  key={row.type}
                  href={`/shipments?type=${row.type}`}
                  className="-mx-2 flex items-center justify-between rounded-lg px-2 py-1 text-sm transition-colors hover:bg-primary/5"
                >
                  <span className="text-foreground/80">
                    {TYPE_LABELS[row.type] ?? row.type}
                  </span>
                  <span className="font-semibold text-primary">
                    {row.count}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-base font-semibold text-primary">
            Pagos por tipo y estado
          </h3>
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
          <h3 className="text-base font-semibold text-primary">
            COD por repartidor
          </h3>
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
      )}
    </div>
  );
}
