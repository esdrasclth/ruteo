"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  Coins,
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  Ingresos,
  PlatformResumen,
  platformApi,
  Salud,
  UsoPlan,
} from "@/lib/platform-api";
import { Card, CardContent } from "@/components/ui/card";

const PLAN_ORDEN = ["FREE", "STARTER", "PRO", "ENTERPRISE"] as const;

export default function AdminResumenPage() {
  const [datos, setDatos] = useState<PlatformResumen | null>(null);
  const [salud, setSalud] = useState<Salud | null>(null);
  const [uso, setUso] = useState<UsoPlan[] | null>(null);
  const [ingresos, setIngresos] = useState<Ingresos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      platformApi<PlatformResumen>("/resumen").then(setDatos),
      platformApi<Salud>("/salud").then(setSalud),
      platformApi<UsoPlan[]>("/uso").then(setUso),
      platformApi<Ingresos>("/ingresos").then(setIngresos),
    ]).catch((e) =>
      setError(e instanceof ApiError ? e.message : "No se pudo cargar"),
    );
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!datos) return null;

  const tarjetas = [
    { label: "Empresas", valor: String(datos.tenants), icon: Building2 },
    {
      label: "Activas",
      valor: String(datos.porEstado.ACTIVE ?? 0),
      icon: PlayCircle,
    },
    {
      label: "Suspendidas",
      valor: String(datos.porEstado.SUSPENDED ?? 0),
      icon: PauseCircle,
    },
    {
      label: "MRR",
      valor: ingresos ? `${ingresos.moneda} ${ingresos.mrr}` : "—",
      icon: Coins,
    },
  ];

  // Solo las que van al 70% o mas: por debajo no hay nada que hacer, y una
  // tabla con todas esconde justo las que importan.
  const apretadas =
    uso?.filter((u) => u.porcentaje != null && u.porcentaje >= 70) ?? [];
  const hayFallos =
    salud && (salud.notificacionesFallidas > 0 || salud.webhooksFallidos > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          Resumen de plataforma
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Estado general de todas las empresas del sistema.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tarjetas.map(({ label, valor, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {label}
                </p>
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-primary">
                {valor}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* La salud va arriba y SOLO aparece si hay algo roto: una tarjeta que
          siempre dice "todo bien" se deja de mirar a los tres dias, y entonces
          no sirve el dia que sí hay un problema. */}
      {hayFallos ? (
        <Card className="border-amber-500/25 bg-amber-50/60">
          <CardContent className="pt-6">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
              <AlertTriangle className="size-4" />
              Fallos en las ultimas {salud!.ventanaHoras} horas
            </p>
            <div className="mt-3 flex flex-wrap gap-6 text-sm">
              <span>
                <span className="font-semibold tabular-nums">
                  {salud!.notificacionesFallidas}
                </span>{" "}
                <span className="text-muted-foreground">
                  avisos no entregados
                </span>
              </span>
              <span>
                <span className="font-semibold tabular-nums">
                  {salud!.webhooksFallidos}
                </span>{" "}
                <span className="text-muted-foreground">webhooks fallidos</span>
              </span>
              <span>
                <span className="font-semibold tabular-nums">
                  {salud!.notificacionesPendientes}
                </span>{" "}
                <span className="text-muted-foreground">avisos en cola</span>
              </span>
            </div>
            {salud!.empresasConFallos.length ? (
              <div className="mt-3 grid gap-1.5">
                {salud!.empresasConFallos.slice(0, 5).map((e) => (
                  <Link
                    key={e.tenant!.id}
                    href={`/admin/tenants/${e.tenant!.id}`}
                    className="flex justify-between rounded-lg bg-white/60 px-3 py-1.5 text-sm hover:bg-white"
                  >
                    <span className="text-primary">{e.tenant!.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {e.fallos} fallos
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-primary">Ingresos por plan</p>
            {ingresos?.porPlan.length ? (
              <div className="mt-3 grid gap-2">
                {ingresos.porPlan.map((p) => (
                  <div
                    key={p.plan}
                    className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm"
                  >
                    <span>
                      {p.plan}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {p.cuentas} empresa{p.cuentas === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums text-primary">
                      {ingresos.moneda} {p.monto}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Todavia no hay suscripciones activas de pago.
              </p>
            )}
            {ingresos ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {ingresos.empresasEnPlanGratuito} empresa
                {ingresos.empresasEnPlanGratuito === 1 ? "" : "s"} en plan
                gratuito. El MRR sale de las suscripciones activas, no del plan
                asignado: una empresa puede tener plan PRO con la suscripcion
                cancelada.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-primary">
              Cerca del limite de su plan
            </p>
            {apretadas.length ? (
              <div className="mt-3 grid gap-2">
                {apretadas.slice(0, 6).map((u) => (
                  <Link
                    key={u.id}
                    href={`/admin/tenants/${u.id}`}
                    className="rounded-lg border border-border/60 px-3 py-2 hover:border-primary/25"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-primary">{u.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {u.usados}/{u.limite} · {u.porcentaje}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={
                          (u.porcentaje ?? 0) >= 100
                            ? "h-full bg-destructive"
                            : "h-full bg-primary/60"
                        }
                        style={{ width: `${Math.min(u.porcentaje ?? 0, 100)}%` }}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Ninguna empresa pasa del 70% de su cupo.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm font-medium text-primary">Empresas por plan</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {PLAN_ORDEN.map((p) => (
              <div key={p} className="rounded-xl border border-border/70 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {p}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-primary">
                  {datos.porPlan[p] ?? 0}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link
          href="/admin/tenants"
          className="font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary/60"
        >
          Ver todas las empresas
        </Link>
        <span className="text-muted-foreground">
          {datos.envios} envios en total
        </span>
      </div>
    </div>
  );
}
