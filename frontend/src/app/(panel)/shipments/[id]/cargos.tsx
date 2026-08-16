"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  Charge,
  ChargeConcept,
  ChargeKind,
  ChargesDeEnvio,
  PaymentMethod,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import {
  CHARGE_CONCEPT_LABELS,
  CHARGE_KIND_LABELS,
  CHARGE_STATUS_LABELS,
  chargeStatusBadgeClass,
  PAYMENT_METHOD_LABELS,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Los cargos del envío: qué se le cobra al cliente y de quién es ese dinero.
 *
 * La liquidación aduanera ya los venía generando sola, pero hasta ahora no había
 * dónde verlos. Que el desglose entre ingreso propio y tributo trasladado se lea
 * aquí y no solo en un informe es el punto: quien discute una factura con el
 * cliente la tiene delante mientras habla.
 */

const CONCEPTOS = Object.keys(CHARGE_CONCEPT_LABELS) as ChargeConcept[];
const METODOS: PaymentMethod[] = ["CASH", "CARD", "TRANSFER"];

function money(amount: string | number, moneda: string | null) {
  return `${Number(amount).toFixed(2)} ${moneda ?? ""}`.trim();
}

function Cifra({
  label,
  value,
  hint,
  fuerte,
}: {
  label: string;
  value: string;
  hint?: string;
  fuerte?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={fuerte ? "text-lg font-semibold" : "text-sm font-medium"}>
        {value}
      </p>
      {hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function Cargos({
  shipmentId,
  onCobrado,
}: {
  shipmentId: string;
  /** El cobro toca los pagos del envío, que el detalle muestra más arriba. */
  onCobrado?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  const [abrirAlta, setAbrirAlta] = useState(false);
  const [alta, setAlta] = useState({
    concept: "FREIGHT" as ChargeConcept,
    kind: "" as ChargeKind | "",
    amount: "",
    notes: "",
  });

  const [abrirCobro, setAbrirCobro] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");

  const [anulando, setAnulando] = useState<Charge | null>(null);
  const [motivo, setMotivo] = useState("");

  const { datos, error, recargar } = useApi<ChargesDeEnvio>(
    `/charges/envio/${shipmentId}`,
    {
      mensajeDeError: "Error cargando cargos",
      // Un 403 aquí significa «esta empresa no contrató el módulo de cobros»,
      // no que algo se rompiera. Mismo criterio que en `Posventa`: un aviso
      // rojo en cada envío que se abre, por una función que ni siquiera
      // compraron, es ruido que enseña a ignorar los avisos que sí importan.
      silencioso: (e) => e.status === 403,
    },
  );

  // Y sin módulo tampoco se dibuja la tarjeta. Antes se quedaba en esqueleto
  // para siempre, que es peor que no estar: parece que algo sigue cargando.
  const sinModulo = error?.status === 403;

  const cargar = useCallback(async () => {
    await recargar();
    // Se limpia la selección tras recargar: mantener marcado un cargo que
    // acaba de cobrarse invitaría a cobrarlo dos veces.
    setSeleccion(new Set());
  }, [recargar]);

  const totalSeleccionado = useMemo(
    () =>
      (datos?.items ?? [])
        .filter((c) => seleccion.has(c.id))
        .reduce((t, c) => t + Number(c.amount), 0),
    [datos, seleccion],
  );

  function alternar(id: string) {
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function crear(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/charges", {
        method: "POST",
        body: JSON.stringify({
          shipmentId,
          concept: alta.concept,
          // Vacío = la naturaleza habitual del concepto, que decide el backend.
          kind: alta.kind || undefined,
          amount: Number(alta.amount),
          notes: alta.notes.trim() || undefined,
        }),
      });
      toast.success("Cargo añadido");
      setAbrirAlta(false);
      setAlta({ concept: "FREIGHT", kind: "", amount: "", notes: "" });
      await cargar();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo añadir el cargo",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cobrar(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/charges/cobrar", {
        method: "POST",
        body: JSON.stringify({
          chargeIds: [...seleccion],
          method,
          reference: reference.trim() || undefined,
        }),
      });
      toast.success("Cobro registrado");
      setAbrirCobro(false);
      setReference("");
      await cargar();
      onCobrado?.();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo registrar el cobro",
      );
    } finally {
      setBusy(false);
    }
  }

  async function anular(e: FormEvent) {
    e.preventDefault();
    if (!anulando) return;
    setBusy(true);
    try {
      await api(`/charges/${anulando.id}/anular`, {
        method: "PATCH",
        body: JSON.stringify({ motivo: motivo.trim() }),
      });
      toast.success("Cargo anulado");
      setAnulando(null);
      setMotivo("");
      await cargar();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo anular",
      );
    } finally {
      setBusy(false);
    }
  }

  if (sinModulo) return null;
  if (!datos) return <Skeleton className="h-40 w-full rounded-2xl" />;

  const moneda = datos.moneda;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Cargos</CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAbrirAlta(true)}
            >
              Añadir cargo
            </Button>
            <Button
              size="sm"
              disabled={seleccion.size === 0}
              onClick={() => setAbrirCobro(true)}
            >
              Cobrar
              {seleccion.size > 0 ? ` (${seleccion.size})` : ""}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 rounded-xl border bg-muted/30 p-4 sm:grid-cols-4">
          <Cifra
            label="Ingreso propio"
            value={money(datos.ingreso, moneda)}
            hint="lo que gana la empresa"
          />
          <Cifra
            label="Tributo trasladado"
            value={money(datos.trasladado, moneda)}
            hint="se cobra y se entrega al Estado"
          />
          <Cifra label="Cobrado" value={money(datos.cobrado, moneda)} />
          {/* Es la cifra que decide si el envío se puede liberar de aduana, así
              que se lee antes que ninguna otra. */}
          <Cifra
            label="Pendiente"
            value={money(datos.pendiente, moneda)}
            fuerte
            hint={
              Number(datos.pendiente) > 0
                ? "bloquea la liberación de aduana"
                : undefined
            }
          />
        </div>

        {datos.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin cargos. Los de aduana aparecen solos al guardar la liquidación;
            el flete y los extras se añaden aquí.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Concepto</TableHead>
                  <TableHead>Naturaleza</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      {c.status === "PENDING" ? (
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={seleccion.has(c.id)}
                          onChange={() => alternar(c.id)}
                          aria-label={`Seleccionar ${CHARGE_CONCEPT_LABELS[c.concept]}`}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {CHARGE_CONCEPT_LABELS[c.concept]}
                      </span>
                      {/* De dónde salió: un cargo de la liquidación se rehace
                          al recalcular aduana, uno manual no. */}
                      {c.source !== "manual" ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {c.source === "customs" ? "liquidación" : c.source}
                        </span>
                      ) : null}
                      {c.notes ? (
                        <p className="max-w-[28ch] truncate text-xs text-muted-foreground">
                          {c.notes}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {CHARGE_KIND_LABELS[c.kind]}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(c.amount, c.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge className={chargeStatusBadgeClass(c.status)}>
                        {CHARGE_STATUS_LABELS[c.status]}
                      </Badge>
                      {c.payment?.reference ? (
                        <p className="text-xs text-muted-foreground">
                          {c.payment.reference}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.status === "PENDING" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAnulando(c)}
                        >
                          Anular
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={abrirAlta} onOpenChange={setAbrirAlta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir cargo</DialogTitle>
          </DialogHeader>
          <form onSubmit={crear} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="concepto">Concepto</Label>
              <Select
                value={alta.concept}
                onValueChange={(v) =>
                  setAlta((a) => ({ ...a, concept: v as ChargeConcept }))
                }
              >
                <SelectTrigger id="concepto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONCEPTOS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CHARGE_CONCEPT_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="naturaleza">Naturaleza</Label>
              <Select
                value={alta.kind || "DEFECTO"}
                onValueChange={(v) =>
                  setAlta((a) => ({
                    ...a,
                    kind: v === "DEFECTO" ? "" : (v as ChargeKind),
                  }))
                }
              >
                <SelectTrigger id="naturaleza">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEFECTO">La habitual del concepto</SelectItem>
                  <SelectItem value="REVENUE">
                    {CHARGE_KIND_LABELS.REVENUE}
                  </SelectItem>
                  <SelectItem value="PASS_THROUGH">
                    {CHARGE_KIND_LABELS.PASS_THROUGH}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Se cambia cuando el acuerdo con el cliente se sale de lo normal
                —hay couriers que absorben el manejo y otros que lo trasladan—.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="importe">Importe</Label>
              <Input
                id="importe"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={alta.amount}
                onChange={(e) =>
                  setAlta((a) => ({ ...a, amount: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notas">Notas</Label>
              <Textarea
                id="notas"
                rows={2}
                value={alta.notes}
                onChange={(e) =>
                  setAlta((a) => ({ ...a, notes: e.target.value }))
                }
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Guardando…" : "Añadir"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={abrirCobro} onOpenChange={setAbrirCobro}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cobrar cargos</DialogTitle>
          </DialogHeader>
          <form onSubmit={cobrar} className="grid gap-4">
            {/* Un solo pago por los cargos marcados: es como ocurre en el
                mostrador, el cliente paga el total. */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                {seleccion.size} cargo{seleccion.size === 1 ? "" : "s"} · se
                registra un pago por
              </p>
              <p className="text-xl font-semibold">
                {money(totalSeleccionado, moneda)}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="metodo">Método</Label>
              <Select
                value={method}
                onValueChange={(v) => setMethod(v as PaymentMethod)}
              >
                <SelectTrigger id="metodo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METODOS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="referencia">Referencia</Label>
              <Input
                id="referencia"
                placeholder="Recibo 00184"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Registrando…" : "Registrar cobro"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={anulando !== null}
        onOpenChange={(o) => {
          if (!o) setAnulando(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular cargo</DialogTitle>
          </DialogHeader>
          <form onSubmit={anular} className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              El cargo no se borra: queda como anulado y deja de contar. Hace
              falta decir por qué, o meses después nadie distingue el error de
              digitación de la cortesía comercial.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="motivo">Motivo</Label>
              <Textarea
                id="motivo"
                rows={2}
                required
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                variant="destructive"
                disabled={busy || motivo.trim() === ""}
              >
                {busy ? "Anulando…" : "Anular"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
