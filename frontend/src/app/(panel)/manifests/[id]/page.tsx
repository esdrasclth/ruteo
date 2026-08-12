"use client";

import { FormEvent, use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  ManifestDetail,
  Paginated,
  Shipment,
} from "@/lib/api";
import {
  EXCEPTION_SEVERITY_LABELS,
  EXCEPTION_TYPE_LABELS,
  MANIFEST_STATUS_LABELS,
  manifestStatusBadgeClass,
  severityBadgeClass,
} from "@/lib/fase2";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Detalle del manifiesto: sus guías hijas y el cotejo.
 *
 * Las tres fases se ven en la misma pantalla porque son la misma cosa en tres
 * momentos: se arma en borrador, se transmite —y ahí los totales se congelan— y
 * se cotea al llegar. Separarlas en pantallas obligaría a recordar en cuál está
 * cada manifiesto.
 */
export default function ManifestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [m, setM] = useState<ManifestDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const [agregando, setAgregando] = useState(false);
  const [candidatos, setCandidatos] = useState<Shipment[]>([]);
  const [shipmentId, setShipmentId] = useState("");
  const [pieces, setPieces] = useState("1");

  // Conteo del cotejo: id de envío -> bultos y kilos contados.
  const [conteo, setConteo] = useState<
    Record<string, { pieces: string; weight: string }>
  >({});

  const cargar = useCallback(async () => {
    try {
      setM(await api<ManifestDetail>(`/manifests/${id}`));
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error cargando el manifiesto",
      );
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function abrirAgregar() {
    setAgregando(true);
    try {
      const res = await api<Paginated<Shipment>>(
        "/shipments?page=1&pageSize=100",
      );
      const dentro = new Set(m?.items.map((i) => i.shipmentId));
      setCandidatos(res.items.filter((s) => !dentro.has(s.id)));
    } catch {
      setCandidatos([]);
    }
  }

  async function accion(fn: () => Promise<unknown>, exito: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(exito);
      await cargar();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo");
    } finally {
      setBusy(false);
    }
  }

  async function onAgregar(e: FormEvent) {
    e.preventDefault();
    if (!shipmentId) return;
    await accion(
      () =>
        api(`/manifests/${id}/items`, {
          method: "POST",
          body: JSON.stringify({ shipmentId, pieces: Number(pieces) || 1 }),
        }),
      "Guía agregada",
    );
    setAgregando(false);
    setShipmentId("");
    setPieces("1");
  }

  async function onCotejar(e: FormEvent) {
    e.preventDefault();
    if (!m) return;
    // Se manda una línea por CADA guía del manifiesto, incluidas las que no se
    // tocaron: una guía ausente del conteo cuenta como cero recibido, y omitirla
    // haría desaparecer el faltante del informe.
    const items = m.items.map((i) => {
      const c = conteo[i.shipmentId];
      return {
        shipmentId: i.shipmentId,
        receivedPieces: c?.pieces === undefined ? i.pieces : Number(c.pieces) || 0,
        ...(c?.weight ? { receivedWeightKg: Number(c.weight) } : {}),
      };
    });

    await accion(async () => {
      const res = await api<{ cuadra: boolean; excepcionesCreadas: number }>(
        `/manifests/${id}/reconcile`,
        { method: "POST", body: JSON.stringify({ items }) },
      );
      if (!res.cuadra) {
        toast.warning(
          `El cotejo no cuadra: ${res.excepcionesCreadas} excepción(es) abiertas`,
        );
      }
    }, "Cotejo registrado");
  }

  if (!m) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const esBorrador = m.status === "DRAFT";
  const sePuedeCotejar = m.status === "TRANSMITTED" || m.status === "ARRIVED";

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/manifests"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Manifiestos
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{m.number}</h1>
          <Badge className={manifestStatusBadgeClass(m.status)}>
            {MANIFEST_STATUS_LABELS[m.status]}
          </Badge>
        </div>
        <div className="flex gap-2">
          {esBorrador && (
            <>
              <Button variant="outline" onClick={abrirAgregar} disabled={busy}>
                <Plus className="size-4" />
                Agregar guía
              </Button>
              <Button
                disabled={busy || m.items.length === 0}
                onClick={() =>
                  accion(
                    () =>
                      api(`/manifests/${id}/transmit`, { method: "POST" }),
                    "Manifiesto transmitido",
                  )
                }
              >
                <Send className="size-4" />
                Transmitir
              </Button>
            </>
          )}
        </div>
      </div>

      {!esBorrador && (
        <Card>
          <CardContent className="flex flex-wrap gap-8 py-4 text-sm">
            <span>
              Declarado:{" "}
              <strong>
                {m.totalPieces} bultos / {m.totalWeightKg} kg
              </strong>
            </span>
            {m.receivedPieces !== null && (
              <span>
                Recibido:{" "}
                <strong
                  className={
                    m.receivedPieces === m.totalPieces
                      ? "text-emerald-600"
                      : "text-red-600"
                  }
                >
                  {m.receivedPieces} bultos / {m.receivedWeightKg} kg
                </strong>
              </span>
            )}
            {m.reconciledAt && (
              <span className="text-muted-foreground">
                Cotejado {new Date(m.reconciledAt).toLocaleString()}
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {m.exceptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Diferencias encontradas
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {m.exceptions.map((x) => (
              <div
                key={x.id}
                className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm"
              >
                <Badge className={severityBadgeClass(x.severity)}>
                  {EXCEPTION_SEVERITY_LABELS[x.severity]}
                </Badge>
                <span className="font-medium">
                  {EXCEPTION_TYPE_LABELS[x.type]}
                </span>
                <span className="text-muted-foreground">{x.description}</span>
                {x.expectedValue && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {x.expectedValue} → {x.actualValue}
                  </span>
                )}
              </div>
            ))}
            <Link
              href="/exceptions"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Gestionarlas en Excepciones
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Guías ({m.items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCotejar}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guía</TableHead>
                  <TableHead>Consignatario</TableHead>
                  <TableHead className="text-right">Declarado</TableHead>
                  {sePuedeCotejar && (
                    <>
                      <TableHead className="w-24">Bultos</TableHead>
                      <TableHead className="w-28">Kg</TableHead>
                    </>
                  )}
                  {m.status === "RECONCILED" && (
                    <TableHead className="text-right">Recibido</TableHead>
                  )}
                  {esBorrador && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {m.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">
                      {i.shipment.trackingNumber}
                    </TableCell>
                    <TableCell>{i.consignee ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {i.pieces} / {i.weightKg} kg
                    </TableCell>
                    {sePuedeCotejar && (
                      <>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            className="h-8"
                            placeholder={String(i.pieces)}
                            value={conteo[i.shipmentId]?.pieces ?? ""}
                            onChange={(e) =>
                              setConteo((c) => ({
                                ...c,
                                [i.shipmentId]: {
                                  pieces: e.target.value,
                                  weight: c[i.shipmentId]?.weight ?? "",
                                },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            className="h-8"
                            value={conteo[i.shipmentId]?.weight ?? ""}
                            onChange={(e) =>
                              setConteo((c) => ({
                                ...c,
                                [i.shipmentId]: {
                                  pieces: c[i.shipmentId]?.pieces ?? "",
                                  weight: e.target.value,
                                },
                              }))
                            }
                          />
                        </TableCell>
                      </>
                    )}
                    {m.status === "RECONCILED" && (
                      <TableCell className="text-right">
                        {i.receivedPieces ?? 0} / {i.receivedWeightKg ?? "—"} kg
                      </TableCell>
                    )}
                    {esBorrador && (
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            accion(
                              () =>
                                api(`/manifests/${id}/items/${i.id}`, {
                                  method: "DELETE",
                                }),
                              "Guía quitada",
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {sePuedeCotejar && m.items.length > 0 && (
              <div className="mt-4 flex items-center gap-3">
                <Button type="submit" disabled={busy}>
                  Registrar cotejo
                </Button>
                <p className="text-xs text-muted-foreground">
                  Lo que dejes en blanco se cuenta como lo declarado. Las
                  diferencias generan excepciones automáticamente.
                </p>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      <Dialog open={agregando} onOpenChange={setAgregando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar guía al manifiesto</DialogTitle>
          </DialogHeader>
          <form onSubmit={onAgregar} className="grid gap-4">
            <div className="grid gap-2">
              <Label>Envío *</Label>
              <Select value={shipmentId} onValueChange={setShipmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Elige un envío" />
                </SelectTrigger>
                <SelectContent>
                  {candidatos.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.trackingNumber} — {s.recipientName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pieces">Bultos</Label>
              <Input
                id="pieces"
                type="number"
                min="1"
                value={pieces}
                onChange={(e) => setPieces(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy || !shipmentId}>
                Agregar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
