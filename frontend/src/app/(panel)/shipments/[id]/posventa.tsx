"use client";

import { FormEvent, useCallback, useState } from "react";
import Link from "next/link";
import { MessageSquareWarning, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  Claim,
  ClaimType,
  Devolucion,
  Paginated,
  ReturnDestination,
  ReturnReason,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import {
  CLAIM_STATUS_CLASSES,
  CLAIM_STATUS_LABELS,
  CLAIM_TYPE_LABELS,
  RETURN_DESTINATION_LABELS,
  RETURN_REASON_LABELS,
  RETURN_STATUS_CLASSES,
  RETURN_STATUS_LABELS,
} from "@/lib/logistics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * Posventa del envío: sus reclamos y su devolución.
 *
 * Vive en el detalle del envío y no sólo en las bandejas porque el momento en
 * que hace falta abrir un reclamo es justo mientras se mira el envío del que
 * alguien se está quejando. Obligar a memorizar el número de rastreo, salir a
 * otra pantalla y volver a buscarlo es cómo se acaban registrando en un
 * cuaderno.
 *
 * Sólo se dibuja cuando hay algo que enseñar o algo que hacer: en un envío
 * recién creado no aporta nada, y una tarjeta vacía en cada detalle alarga la
 * pantalla para todos por el caso de unos pocos.
 */
export function Posventa({
  shipmentId,
  trackingNumber,
}: {
  shipmentId: string;
  trackingNumber: string;
}) {
  const [abrirReclamo, setAbrirReclamo] = useState(false);
  const [abrirDevolucion, setAbrirDevolucion] = useState(false);
  const [busy, setBusy] = useState(false);

  const [reclamo, setReclamo] = useState({
    type: "DAMAGED" as ClaimType,
    description: "",
    claimedAmount: "",
  });
  const [devo, setDevo] = useState({
    destination: "SENDER" as ReturnDestination,
    reason: "UNDELIVERABLE" as ReturnReason,
    notes: "",
  });

  // Silencio a propósito en las dos: si la empresa no tiene el módulo de
  // posventa contratado esto responde 403, y un toast de error en cada envío
  // que se abre sería ruido por una función que ni siquiera compraron.
  const reclamos = useApi<Paginated<Claim>>(
    `/claims?shipmentId=${shipmentId}&pageSize=20`,
    { silencioso: true },
  );
  // No hay endpoint por envío: la devolución es una por envío, así que se
  // filtra en cliente sobre una lista corta en vez de añadir una ruta que sólo
  // usaría esta tarjeta.
  //
  // Esta clave es SUYA: la bandeja de devoluciones pide `pageSize=50` con
  // filtro de estado, que es otra cadena y por tanto otra entrada de caché. Lo
  // que sí se ahorra es pedirla de nuevo al pasar por varios envíos seguidos.
  const devoluciones = useApi<Paginated<Devolucion>>(`/returns?pageSize=100`, {
    silencioso: true,
  });

  const claims = reclamos.datos?.items ?? [];
  const devolucion =
    devoluciones.datos?.items.find((d) => d.shipmentId === shipmentId) ?? null;
  const cargado = !reclamos.cargando && !devoluciones.cargando;

  const { recargar: recargarReclamos } = reclamos;
  const { recargar: recargarDevoluciones } = devoluciones;
  const cargar = useCallback(async () => {
    await Promise.all([recargarReclamos(), recargarDevoluciones()]);
  }, [recargarReclamos, recargarDevoluciones]);

  async function onCrearReclamo(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/claims", {
        method: "POST",
        body: JSON.stringify({
          shipmentId,
          type: reclamo.type,
          description: reclamo.description.trim(),
          ...(reclamo.claimedAmount
            ? { claimedAmount: Number(reclamo.claimedAmount) }
            : {}),
        }),
      });
      toast.success("Reclamo abierto");
      setAbrirReclamo(false);
      setReclamo({ type: "DAMAGED", description: "", claimedAmount: "" });
      await cargar();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo abrir el reclamo",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onCrearDevolucion(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/returns", {
        method: "POST",
        body: JSON.stringify({
          shipmentId,
          destination: devo.destination,
          reason: devo.reason,
          ...(devo.notes ? { notes: devo.notes } : {}),
        }),
      });
      toast.success("Devolución registrada");
      setAbrirDevolucion(false);
      await cargar();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo registrar",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!cargado) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Posventa</CardTitle>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAbrirReclamo(true)}
          >
            <MessageSquareWarning className="size-4" />
            Reclamo
          </Button>
          {/* Una devolución por envío: con una ya registrada el botón sobra, y
              dejarlo daría un 400 que parece un fallo del sistema. */}
          {!devolucion && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAbrirDevolucion(true)}
            >
              <Undo2 className="size-4" />
              Devolver
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {claims.length === 0 && !devolucion && (
          <p className="text-sm text-muted-foreground">
            Sin reclamos ni devoluciones.
          </p>
        )}

        {claims.map((c) => (
          <Link
            key={c.id}
            href="/claims"
            className="flex items-start justify-between gap-3 rounded-md border p-3 hover:bg-muted/50"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {c.number} · {CLAIM_TYPE_LABELS[c.type]}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {c.description}
              </p>
              {c.resolution && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Resolución: {c.resolution}
                </p>
              )}
            </div>
            <Badge className={CLAIM_STATUS_CLASSES[c.status]}>
              {CLAIM_STATUS_LABELS[c.status]}
            </Badge>
          </Link>
        ))}

        {devolucion && (
          <Link
            href="/returns"
            className="flex items-start justify-between gap-3 rounded-md border p-3 hover:bg-muted/50"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {RETURN_DESTINATION_LABELS[devolucion.destination]}
              </p>
              <p className="text-xs text-muted-foreground">
                {RETURN_REASON_LABELS[devolucion.reason]}
                {devolucion.attemptsBefore != null &&
                  ` · ${devolucion.attemptsBefore} intento${devolucion.attemptsBefore === 1 ? "" : "s"} antes`}
              </p>
            </div>
            <Badge className={RETURN_STATUS_CLASSES[devolucion.status]}>
              {RETURN_STATUS_LABELS[devolucion.status]}
            </Badge>
          </Link>
        )}
      </CardContent>

      <Dialog open={abrirReclamo} onOpenChange={setAbrirReclamo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reclamo sobre {trackingNumber}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCrearReclamo} className="space-y-4">
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Select
                value={reclamo.type}
                onValueChange={(v) =>
                  setReclamo((r) => ({ ...r, type: v as ClaimType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(CLAIM_TYPE_LABELS) as (keyof typeof CLAIM_TYPE_LABELS)[]
                  ).map((t) => (
                    <SelectItem key={t} value={t}>
                      {CLAIM_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Qué pasó</Label>
              <Textarea
                id="desc"
                value={reclamo.description}
                onChange={(e) =>
                  setReclamo((r) => ({ ...r, description: e.target.value }))
                }
                minLength={10}
                required
                rows={3}
                placeholder="Con qué se encontró el cliente, con sus palabras"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monto">Monto reclamado (opcional)</Label>
              <Input
                id="monto"
                type="number"
                step="0.01"
                min="0"
                value={reclamo.claimedAmount}
                onChange={(e) =>
                  setReclamo((r) => ({ ...r, claimedAmount: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Déjalo vacío si sólo pide una explicación.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                Abrir reclamo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={abrirDevolucion} onOpenChange={setAbrirDevolucion}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver {trackingNumber}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCrearDevolucion} className="space-y-4">
            <div className="space-y-2">
              <Label>A dónde vuelve</Label>
              <Select
                value={devo.destination}
                onValueChange={(v) =>
                  setDevo((d) => ({ ...d, destination: v as ReturnDestination }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* «A sucursal» no se ofrece aquí: exige elegir cuál, y ese
                      selector necesita la lista de bodegas con retiro. Se hace
                      desde la pantalla de Devoluciones. */}
                  {(["SENDER", "VENDOR", "ABANDONED"] as ReturnDestination[]).map(
                    (d) => (
                      <SelectItem key={d} value={d}>
                        {RETURN_DESTINATION_LABELS[d]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Por qué</Label>
              <Select
                value={devo.reason}
                onValueChange={(v) =>
                  setDevo((d) => ({ ...d, reason: v as ReturnReason }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(
                      RETURN_REASON_LABELS,
                    ) as (keyof typeof RETURN_REASON_LABELS)[]
                  ).map((r) => (
                    <SelectItem key={r} value={r}>
                      {RETURN_REASON_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notas">Notas (opcional)</Label>
              <Input
                id="notas"
                value={devo.notes}
                onChange={(e) =>
                  setDevo((d) => ({ ...d, notes: e.target.value }))
                }
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                Registrar devolución
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
