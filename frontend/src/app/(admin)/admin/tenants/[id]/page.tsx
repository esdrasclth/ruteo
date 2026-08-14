"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { platformApi, Plan, TenantDetalle } from "@/lib/platform-api";
import { Button } from "@/components/ui/button";
import { PlatformAudit } from "@/components/platform-audit";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PLANES: Plan[] = ["FREE", "STARTER", "PRO", "ENTERPRISE"];

export default function AdminTenantDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [t, setT] = useState<TenantDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [motivoBorrado, setMotivoBorrado] = useState("");
  const [confirmacion, setConfirmacion] = useState("");

  const cargar = useCallback(() => {
    platformApi<TenantDetalle>(`/tenants/${id}`)
      .then(setT)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "No se pudo cargar"),
      );
  }, [id]);

  useEffect(cargar, [cargar]);

  async function accion<T>(fn: () => Promise<T>, exito: string) {
    setGuardando(true);
    try {
      const nuevo = (await fn()) as TenantDetalle;
      setT(nuevo);
      toast.success(exito);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  /**
   * Borra la empresa y vuelve a la lista.
   *
   * No usa `accion()` como el resto: aquélla mete la respuesta en el estado de
   * la ficha, y aquí la ficha ya no existe. Dejarla puesta habría pintado una
   * pantalla de una empresa borrada, con botones que fallan uno a uno.
   */
  async function borrar() {
    setGuardando(true);
    try {
      const r = await platformApi<{
        borrada: string;
        destruido: { envios: number; usuarios: number };
        archivos: number;
        problemas: string[];
      }>(`/tenants/${id}`, {
        method: "DELETE",
        body: JSON.stringify({
          slug: confirmacion.trim(),
          reason: motivoBorrado.trim(),
        }),
      });
      toast.success(
        `Empresa «${r.borrada}» borrada: ${r.destruido.envios} envíos y ${r.archivos} archivos.`,
      );
      // Lo que no se pudo limpiar se dice en voz alta y sin caducar solo: son
      // archivos o cuentas que quedaron por ahí y que alguien tiene que rematar
      // a mano, y un aviso que se desvanece en tres segundos no sirve.
      if (r.problemas.length > 0) {
        toast.warning(
          `Quedaron restos sin borrar: ${r.problemas.join(" · ")}`,
          { duration: Infinity },
        );
      }
      router.push("/admin/tenants");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo borrar");
      setGuardando(false);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!t) return null;

  const suspendida = t.status !== "ACTIVE";
  const grupos = ["Operación", "Comercial", "Administración"];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/tenants"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-4" />
        Empresas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">
            {t.name}
          </h1>
          <p className="font-mono text-sm text-muted-foreground">{t.slug}</p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {Object.entries(t.uso).map(([k, v]) => (
            <div key={k}>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {k}
              </p>
              <p className="text-xl font-semibold tabular-nums text-primary">
                {v}
              </p>
            </div>
          ))}
        </div>
      </div>

      {suspendida ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-50/70 px-4 py-3 text-sm">
          <p className="font-medium text-amber-800">
            Esta empresa está {t.status === "SUSPENDED" ? "suspendida" : "cancelada"}.
          </p>
          {t.statusReason ? (
            <p className="mt-0.5 text-muted-foreground">{t.statusReason}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Sus usuarios no pueden operar: la API les responde 403 con este
            motivo.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="grid gap-4 pt-6">
            <div>
              <p className="text-sm font-medium text-primary">Plan</p>
              <p className="text-xs text-muted-foreground">
                {t.planInfo.name} · {t.planInfo.currency}{" "}
                {t.planInfo.monthlyAmount}/mes ·{" "}
                {t.planInfo.shipmentLimit == null
                  ? "envíos ilimitados"
                  : `${t.planInfo.shipmentLimit} envíos/mes`}
              </p>
            </div>
            <Select
              value={t.plan}
              onValueChange={(plan) =>
                accion(
                  () =>
                    platformApi(`/tenants/${t.id}/plan`, {
                      method: "PATCH",
                      body: JSON.stringify({ plan }),
                    }),
                  "Plan actualizado",
                )
              }
            >
              <SelectTrigger disabled={guardando}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLANES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Cambiar de plan reajusta los módulos incluidos. Las excepciones que
              hayas puesto abajo se conservan.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-3 pt-6">
            <p className="text-sm font-medium text-primary">Estado</p>
            {suspendida ? (
              <Button
                disabled={guardando}
                onClick={() =>
                  accion(
                    () =>
                      platformApi(`/tenants/${t.id}/status`, {
                        method: "PATCH",
                        body: JSON.stringify({ status: "ACTIVE" }),
                      }),
                    "Empresa reactivada",
                  )
                }
              >
                Reactivar empresa
              </Button>
            ) : (
              <>
                <Label htmlFor="motivo" className="text-xs">
                  Motivo de la suspensión
                </Label>
                <Input
                  id="motivo"
                  placeholder="Falta de pago de agosto"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
                {/* El motivo es obligatorio en el backend; se pide aquí para
                    que el error no llegue después de pulsar. */}
                <Button
                  variant="destructive"
                  disabled={guardando || !motivo.trim()}
                  onClick={() =>
                    accion(
                      () =>
                        platformApi(`/tenants/${t.id}/status`, {
                          method: "PATCH",
                          body: JSON.stringify({
                            status: "SUSPENDED",
                            reason: motivo.trim(),
                          }),
                        }),
                      "Empresa suspendida",
                    )
                  }
                >
                  Suspender empresa
                </Button>
                <p className="text-xs text-muted-foreground">
                  Deja de poder operar en cuanto caduque su caché de estado
                  (hasta 1 minuto).
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm font-medium text-primary">Módulos</p>
          <p className="mt-1 text-xs text-muted-foreground">
            El plan marca los incluidos. Puedes desviarte por empresa; lo que
            cambies aquí se conserva al cambiar de plan.
          </p>

          <div className="mt-5 grid gap-6">
            {grupos.map((g) => (
              <div key={g}>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {g}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {t.modulos
                    .filter((m) => m.grupo === g)
                    .map((m) => (
                      <label
                        key={m.key}
                        className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                          m.esencial
                            ? "border-border/60 bg-muted/40"
                            : "cursor-pointer border-border/70 bg-white hover:border-primary/25"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-sm text-foreground">
                            {m.label}
                            {m.esencial ? (
                              <Lock className="size-3 text-muted-foreground" />
                            ) : null}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {m.esencial
                              ? "Esencial: no se puede apagar"
                              : m.excepcion
                                ? `Excepción${m.excepcion.reason ? `: ${m.excepcion.reason}` : ""}`
                                : m.incluidoEnPlan
                                  ? "Incluido en el plan"
                                  : "No incluido en el plan"}
                          </span>
                        </span>
                        <input
                          type="checkbox"
                          checked={m.activo}
                          disabled={m.esencial || guardando}
                          onChange={(e) =>
                            accion(
                              () =>
                                platformApi(`/tenants/${t.id}/modules`, {
                                  method: "PATCH",
                                  body: JSON.stringify({
                                    module: m.key,
                                    enabled: e.target.checked,
                                  }),
                                }),
                              e.target.checked
                                ? `${m.label} activado`
                                : `${m.label} desactivado`,
                            )
                          }
                          className="size-4 shrink-0 accent-primary disabled:opacity-40"
                        />
                      </label>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {/* El historial va en la ficha de la empresa y no solo en su pantalla
              aparte: "¿qué le pasó a este cliente?" se pregunta estando aquí. */}
          <PlatformAudit tenantId={t.id} titulo="Historial de esta empresa" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm font-medium text-primary">
            Usuarios ({t.usuarios.length})
          </p>
          <div className="mt-3 grid gap-2">
            {t.usuarios.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
              >
                <span>
                  {u.name || u.email}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {u.email}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5">{u.role}</span>
                  {u.emailVerified ? null : (
                    <span className="text-amber-700">correo sin verificar</span>
                  )}
                  {u.status !== "ACTIVE" ? (
                    <span className="text-destructive">{u.status}</span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Zona de peligro, al FINAL de la pantalla y no junto a suspender: lo
          reversible y lo irreversible no deben compartir vecindad, o el clic de
          más acaba en el botón que no se puede deshacer. */}
      <Card className="border-destructive/40">
        <CardContent className="space-y-4 pt-6">
          <div>
            <p className="text-sm font-medium text-destructive">
              Borrar esta empresa
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Se borra la empresa y con ella todo lo suyo: envíos, bultos,
              pagos, rutas, documentos, la evidencia guardada en el
              almacenamiento y las cuentas de acceso de sus usuarios.{" "}
              <strong className="text-foreground">
                No se puede deshacer y no hay copia.
              </strong>{" "}
              Si sólo quieres que deje de operar, suspéndela.
            </p>
          </div>

          {/* Lo que se va a destruir, en cifras y antes de pulsar. «Borrar
              empresa» suena abstracto; «1.284 envíos» no. */}
          <p className="text-xs text-muted-foreground">
            Se destruirán {t.uso.shipments} envíos, {t.uso.customers} clientes,{" "}
            {t.uso.routes} rutas y {t.usuarios.length} usuario
            {t.usuarios.length === 1 ? "" : "s"}.
          </p>

          <div className="grid gap-2">
            <Label htmlFor="borrar-motivo">Motivo</Label>
            <Input
              id="borrar-motivo"
              placeholder="Baja solicitada por el cliente"
              value={motivoBorrado}
              onChange={(e) => setMotivoBorrado(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Queda escrito en el historial de plataforma, que sobrevive a la
              empresa. Es lo único que explicará después por qué desapareció.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="borrar-slug">
              Escribe <code className="font-mono">{t.slug}</code> para confirmar
            </Label>
            <Input
              id="borrar-slug"
              autoComplete="off"
              placeholder={t.slug}
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
            />
          </div>

          <Button
            variant="destructive"
            // Se exige el identificador exacto y un motivo con sustancia. El
            // backend lo vuelve a comprobar; esto sólo evita llegar hasta allí
            // para que te digan lo que ya se sabe aquí.
            disabled={
              guardando ||
              confirmacion.trim() !== t.slug ||
              motivoBorrado.trim().length < 10
            }
            onClick={borrar}
          >
            <Trash2 className="size-4" aria-hidden />
            Borrar «{t.slug}» para siempre
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
