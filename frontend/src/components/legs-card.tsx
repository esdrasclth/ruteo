"use client";

import { FormEvent, useCallback, useState } from "react";
import { ExternalLink, Plane, Plus, Ship, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  Carrier,
  LegMode,
  LegStatus,
  ShipmentDetail,
} from "@/lib/api";
import { legModeLabel } from "@/lib/logistics";
import { Badge } from "@/components/ui/badge";
import { useConfirmar } from "@/components/confirmar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddressSearch } from "@/components/address-search";

const LEG_STATUS_LABELS: Record<LegStatus, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En curso",
  COMPLETED: "Completado",
};

const MODOS: LegMode[] = ["AIR", "SEA", "GROUND"];
const NINGUNO = "NONE";

function iconoModo(mode: LegMode) {
  if (mode === "AIR") return Plane;
  if (mode === "SEA") return Ship;
  return Truck;
}

function legStatusBadgeClass(status: LegStatus): string {
  switch (status) {
    case "COMPLETED":
      return "bg-primary text-primary-foreground";
    case "IN_PROGRESS":
      return "bg-accent text-accent-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

const VACIO = {
  mode: "AIR" as LegMode,
  originLabel: "",
  originLat: "",
  originLng: "",
  destinationLabel: "",
  destinationLat: "",
  destinationLng: "",
  carrierId: NINGUNO,
  externalTracking: "",
  etaAt: "",
};

// Alta y mantenimiento de los tramos de un envío internacional. Antes esto solo
// existía por Swagger, así que el mapa del rastreo público —que se dibuja a
// partir de los tramos— no se podía alimentar desde el panel.
export function LegsCard({
  shipment,
  onChanged,
}: {
  shipment: ShipmentDetail;
  onChanged: () => void;
}) {
  const confirmar = useConfirmar();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [busy, setBusy] = useState(false);

  const cargarCarriers = useCallback(async () => {
    try {
      setCarriers(await api<Carrier[]>("/carriers"));
    } catch {
      // El transportista es opcional; sin catálogo el resto del alta funciona.
      setCarriers([]);
    }
  }, []);

  // El catálogo se pide al abrir el diálogo, no desde un efecto: es una acción
  // del usuario, y así no hay una carga colgando del ciclo de render.
  function abrir(v: boolean) {
    setOpen(v);
    if (v) void cargarCarriers();
  }

  async function crear(e: FormEvent) {
    e.preventDefault();
    const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
    setBusy(true);
    try {
      await api(`/shipments/${shipment.id}/legs`, {
        method: "POST",
        body: JSON.stringify({
          // La secuencia se deduce: pedirle al operador un "número de orden" es
          // filtrar un detalle del modelo que él no tiene por qué conocer.
          sequence: shipment.legs.length + 1,
          mode: form.mode,
          originLabel: form.originLabel,
          destinationLabel: form.destinationLabel,
          originLat: num(form.originLat),
          originLng: num(form.originLng),
          destinationLat: num(form.destinationLat),
          destinationLng: num(form.destinationLng),
          carrierId: form.carrierId === NINGUNO ? undefined : form.carrierId,
          externalTracking: form.externalTracking.trim() || undefined,
          etaAt: form.etaAt ? new Date(form.etaAt).toISOString() : undefined,
        }),
      });
      toast.success("Tramo agregado");
      setOpen(false);
      setForm(VACIO);
      onChanged();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo agregar el tramo",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cambiarEstado(legId: string, status: LegStatus) {
    try {
      await api(`/shipments/${shipment.id}/legs/${legId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      onChanged();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo cambiar el estado",
      );
    }
  }

  async function borrar(legId: string, seq: number) {
    if (
      !(await confirmar({
        titulo: `¿Eliminar el tramo ${seq}?`,
        descripcion:
          "El recorrido se recalcula con los tramos que queden.",
        accion: "Eliminar",
        peligro: true,
      }))
    ) {
      return;
    }
    try {
      await api(`/shipments/${shipment.id}/legs/${legId}`, {
        method: "DELETE",
      });
      toast.success("Tramo eliminado");
      onChanged();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo eliminar el tramo",
      );
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          Trayecto ({shipment.legs.length})
        </CardTitle>
        <Dialog open={open} onOpenChange={abrir}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="size-4" />
              Agregar tramo
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nuevo tramo</DialogTitle>
            </DialogHeader>
            <form onSubmit={crear} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="legMode">Modo de transporte</Label>
                <Select
                  value={form.mode}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, mode: v as LegMode }))
                  }
                >
                  <SelectTrigger id="legMode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODOS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {legModeLabel(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <AddressSearch
                id="legOrigen"
                label="Origen"
                placeholder="Miami, FL"
                value={form.originLabel}
                onChange={(v) => setForm((f) => ({ ...f, originLabel: v }))}
                onPick={(r) =>
                  setForm((f) => ({
                    ...f,
                    originLabel: r.shortLabel,
                    originLat: String(r.lat),
                    originLng: String(r.lng),
                  }))
                }
                required
                hint="Al elegir una sugerencia se guardan las coordenadas, que son las que dibujan el mapa."
              />

              <AddressSearch
                id="legDestino"
                label="Destino"
                placeholder="Tegucigalpa, HN"
                value={form.destinationLabel}
                onChange={(v) =>
                  setForm((f) => ({ ...f, destinationLabel: v }))
                }
                onPick={(r) =>
                  setForm((f) => ({
                    ...f,
                    destinationLabel: r.shortLabel,
                    destinationLat: String(r.lat),
                    destinationLng: String(r.lng),
                  }))
                }
                required
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="legCarrier">Transportista</Label>
                  <Select
                    value={form.carrierId}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, carrierId: v }))
                    }
                  >
                    <SelectTrigger id="legCarrier">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NINGUNO}>Sin transportista</SelectItem>
                      {carriers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="legTracking">Guía del transportista</Label>
                  <Input
                    id="legTracking"
                    placeholder="1Z999AA10123456784"
                    value={form.externalTracking}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        externalTracking: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="legEta">Llegada estimada</Label>
                <Input
                  id="legEta"
                  type="datetime-local"
                  value={form.etaAt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, etaAt: e.target.value }))
                  }
                />
              </div>

              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  {busy ? "Agregando…" : "Agregar tramo"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        {shipment.legs.length === 0 ? (
          <EmptyState
            icon={Plane}
            title="Sin tramos"
            description="Los tramos son las etapas del viaje: bodega en USA, vuelo, aduana, reparto. Son los que dibujan el mapa que ve tu cliente en el rastreo público."
          />
        ) : (
          <ol className="flex flex-col gap-2.5">
            {shipment.legs.map((leg) => {
              const Icono = iconoModo(leg.mode);
              const sinCoords =
                leg.originLat === null || leg.destinationLat === null;
              return (
                <li
                  key={leg.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/70 p-3.5 text-sm"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/8 text-xs font-medium tabular-nums text-primary">
                    {leg.sequence}
                  </span>
                  <Icono className="size-4 shrink-0 text-muted-foreground" />
                  <span className="shrink-0 font-medium">
                    {legModeLabel(leg.mode)}
                  </span>
                  {/* flex-1 + truncate: las direcciones del geocodificador
                      pueden ser largas y sin esto la fila se parte en tres. */}
                  <span
                    className="min-w-0 flex-1 truncate text-muted-foreground"
                    title={`${leg.originLabel} → ${leg.destinationLabel}`}
                  >
                    {leg.originLabel} → {leg.destinationLabel}
                  </span>

                  <Select
                    value={leg.status}
                    onValueChange={(v) =>
                      cambiarEstado(leg.id, v as LegStatus)
                    }
                  >
                    <SelectTrigger className="h-auto w-auto border-0 bg-transparent p-0 shadow-none focus:ring-0">
                      <Badge className={legStatusBadgeClass(leg.status)}>
                        {LEG_STATUS_LABELS[leg.status]}
                      </Badge>
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        ["PENDING", "IN_PROGRESS", "COMPLETED"] as LegStatus[]
                      ).map((s) => (
                        <SelectItem key={s} value={s}>
                          {LEG_STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {leg.carrier ? (
                    <span className="text-xs text-muted-foreground">
                      {leg.carrier}
                    </span>
                  ) : null}
                  {leg.externalTracking ? (
                    <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      {leg.externalTracking}
                      <ExternalLink className="size-3" />
                    </span>
                  ) : null}
                  {/* Sin coordenadas el tramo no se puede dibujar; avisarlo aquí
                      evita que el cliente vea un mapa incompleto sin explicación. */}
                  {sinCoords ? (
                    <span className="text-xs text-amber-700">
                      sin coordenadas · no sale en el mapa
                    </span>
                  ) : null}

                  <span className="ml-auto flex shrink-0 items-center gap-3">
                    {leg.etaAt ? (
                      <span className="text-xs text-muted-foreground">
                        Estimado:{" "}
                        {new Date(leg.etaAt).toLocaleString("es-HN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Eliminar tramo ${leg.sequence}`}
                      onClick={() => borrar(leg.id, leg.sequence)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
