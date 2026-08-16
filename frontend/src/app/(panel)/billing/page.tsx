"use client";

import { useCallback, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  BillingUsage,
  Plan,
  PlanDefinition,
  Subscription,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import {
  SUBSCRIPTION_STATUS_LABELS,
  subscriptionStatusBadgeClass,
} from "@/lib/logistics";
import { Badge } from "@/components/ui/badge";
import { useConfirmar } from "@/components/confirmar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DatosFiscales } from "@/components/datos-fiscales";

export default function BillingPage() {
  const confirmar = useConfirmar();
  const [busy, setBusy] = useState(false);

  const mensajeDeError = "Error cargando facturación";
  // Tres claves y no un `Promise.all`: el catálogo de planes es el mismo para
  // toda la instalación y no cambia entre visitas, mientras que el consumo sí.
  // Separados, volver a esta pantalla solo vuelve a pedir lo que envejece.
  const planes = useApi<PlanDefinition[]>("/billing/plans", { mensajeDeError });
  const consumo = useApi<BillingUsage>("/billing/usage", { mensajeDeError });
  // Sin suscripción responde 404, y eso es el estado normal de quien está en el
  // plan gratuito, no un fallo.
  const suscripcion = useApi<Subscription | null>("/billing/subscription", {
    nuloSi404: true,
    mensajeDeError,
  });

  const plans = planes.datos ?? null;
  const usage = consumo.datos ?? null;
  const subscription = suscripcion.datos ?? null;
  const loaded = !planes.cargando && !consumo.cargando && !suscripcion.cargando;

  const { recargar: recargarPlanes } = planes;
  const { recargar: recargarConsumo } = consumo;
  const { recargar: recargarSuscripcion } = suscripcion;
  const load = useCallback(async () => {
    await Promise.all([
      recargarPlanes(),
      recargarConsumo(),
      recargarSuscripcion(),
    ]);
  }, [recargarPlanes, recargarConsumo, recargarSuscripcion]);

  async function onSubscribe(plan: Plan) {
    setBusy(true);
    try {
      await api("/billing/subscribe", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      toast.success(`Plan ${plan} activado`);
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo cambiar el plan",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onCancel(atPeriodEnd: boolean) {
    if (
      !(await confirmar({
        titulo: atPeriodEnd
          ? "¿Cancelar al final del período?"
          : "¿Cancelar ahora?",
        descripcion: atPeriodEnd
          ? "Sigues con tu plan hasta que termine el período que ya pagaste, y no se renueva."
          : "Vuelves al plan FREE en el acto, con sus límites y sin los módulos de pago.",
        accion: "Cancelar suscripción",
        peligro: true,
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      await api("/billing/cancel", {
        method: "POST",
        body: JSON.stringify({ atPeriodEnd }),
      });
      toast.success("Suscripción cancelada");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo cancelar",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const pct =
    usage && usage.shipmentLimit
      ? Math.min(100, Math.round((usage.shipmentsUsed / usage.shipmentLimit) * 100))
      : 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Facturación"
        description="Plan, uso del período y suscripción."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Uso del período</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {usage ? (
              <>
                <div className="flex items-baseline justify-between">
                  <p className="text-2xl font-semibold">
                    {usage.shipmentsUsed}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      / {usage.shipmentLimit ?? "∞"} envíos
                    </span>
                  </p>
                  <Badge variant="outline">{usage.plan}</Badge>
                </div>
                {usage.shipmentLimit != null ? (
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={
                        pct >= 90
                          ? "h-full bg-destructive"
                          : "h-full bg-primary"
                      }
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {new Date(usage.periodStart).toLocaleDateString("es-HN")} —{" "}
                  {new Date(usage.periodEnd).toLocaleDateString("es-HN")}
                  {usage.shipmentsRemaining != null
                    ? ` · quedan ${usage.shipmentsRemaining}`
                    : ""}
                </p>
              </>
            ) : (
              <Skeleton className="h-16" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Suscripción</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {subscription ? (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-semibold">{subscription.plan}</p>
                  <Badge
                    className={subscriptionStatusBadgeClass(
                      subscription.status,
                    )}
                  >
                    {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {subscription.amount} {subscription.currency}/mes · período{" "}
                  {new Date(
                    subscription.currentPeriodStart,
                  ).toLocaleDateString("es-HN")}{" "}
                  —{" "}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString(
                    "es-HN",
                  )}
                </p>
                {subscription.cancelAtPeriodEnd ? (
                  <p className="text-sm text-destructive">
                    Se cancela al final del período.
                  </p>
                ) : null}
                {subscription.status === "ACTIVE" ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || subscription.cancelAtPeriodEnd}
                      onClick={() => onCancel(true)}
                    >
                      Cancelar al final del período
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={busy}
                      onClick={() => onCancel(false)}
                    >
                      Cancelar ahora
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Sin suscripción: estás en el plan FREE. Elige un plan abajo.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(plans ?? []).map((p) => {
          const isCurrent = usage?.plan === p.plan;
          return (
            <Card
              key={p.plan}
              className={isCurrent ? "border-primary shadow-sm" : undefined}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  {isCurrent ? (
                    <Badge className="bg-primary text-primary-foreground">
                      Actual
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-2xl font-semibold">
                  {p.monthlyAmount}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    {p.currency}/mes
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.shipmentLimit != null
                    ? `${p.shipmentLimit} envíos por período`
                    : "Envíos ilimitados"}
                </p>
                <ul className="flex flex-col gap-1 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check className="size-3.5 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-auto"
                  variant={isCurrent ? "outline" : "default"}
                  disabled={busy || isCurrent}
                  onClick={() => onSubscribe(p.plan)}
                >
                  {isCurrent ? "Plan actual" : "Cambiar a este plan"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Debajo de los planes a propósito: es el dato que hace falta para
          contratar uno, así que se encuentra justo cuando se busca.
          El MISMO componente sale también en «Mi empresa», que es donde lo
          busca quien no viene a contratar nada. Es uno solo y no una copia:
          dos formularios sobre los mismos campos se separan al primer cambio. */}
      <DatosFiscales />
    </div>
  );
}
