"use client";

import { FormEvent, useCallback, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  api,
  ApiError,
  Claim,
  ClaimStatus,
  Paginated,
  ResumenReclamos,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import {
  CLAIM_STATUS_CLASSES,
  CLAIM_STATUS_LABELS,
  CLAIM_TYPE_LABELS,
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

const fmtFecha = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("es-HN") : "—";

const fmtDinero = (v: string | null, moneda: string) =>
  v == null ? "—" : `${moneda} ${Number(v).toFixed(2)}`;

type Decision = { claim: Claim; accion: "aprobar" | "rechazar" };

/**
 * Bandeja de reclamos.
 *
 * Es la hermana de Excepciones y se parece a propósito, pero responde otra
 * pregunta: aquí el que espera es una persona que ya se quejó, así que lo
 * primero de la pantalla es cuántos hay sin decidir y cuánto dinero está en
 * juego —no el total histórico, que no obliga a hacer nada—.
 */
export default function ClaimsPage() {
  const [filtro, setFiltro] = useState<ClaimStatus | "TODOS">("OPEN");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [resolucion, setResolucion] = useState("");
  const [importe, setImporte] = useState("");
  const [liquidando, setLiquidando] = useState<Claim | null>(null);
  const [pagoId, setPagoId] = useState("");
  const [busy, setBusy] = useState(false);

  const q = filtro === "TODOS" ? "" : `&status=${filtro}`;

  const lista = useApi<Paginated<Claim>>(`/claims?pageSize=50${q}`, {
    mensajeDeError: "Error cargando reclamos",
    keepPreviousData: true,
  });
  // El resumen NO depende del filtro: con su propia clave se pide una vez y
  // sobrevive a los cambios de pestaña, en vez de volver a pedirse con la lista.
  const res = useApi<ResumenReclamos>("/claims/resumen", {
    mensajeDeError: "Error cargando reclamos",
  });

  const datos = lista.datos ?? null;
  const resumen = res.datos ?? null;

  const { recargar: recargarLista } = lista;
  const { recargar: recargarResumen } = res;
  const cargar = useCallback(async () => {
    await Promise.all([recargarLista(), recargarResumen()]);
  }, [recargarLista, recargarResumen]);

  async function accionar(url: string, cuerpo: unknown, exito: string) {
    setBusy(true);
    try {
      await api(url, { method: "PATCH", body: JSON.stringify(cuerpo) });
      toast.success(exito);
      setDecision(null);
      setLiquidando(null);
      setResolucion("");
      setImporte("");
      setPagoId("");
      await cargar();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  function onDecidir(e: FormEvent) {
    e.preventDefault();
    if (!decision) return;
    const cuerpo =
      decision.accion === "aprobar"
        ? { resolution: resolucion.trim(), approvedAmount: Number(importe) }
        : { resolution: resolucion.trim() };
    accionar(
      `/claims/${decision.claim.id}/${decision.accion}`,
      cuerpo,
      decision.accion === "aprobar" ? "Reclamo aprobado" : "Reclamo rechazado",
    );
  }

  function onLiquidar(e: FormEvent) {
    e.preventDefault();
    if (!liquidando) return;
    accionar(
      `/claims/${liquidando.id}/liquidar`,
      { paymentId: pagoId.trim() },
      "Reclamo liquidado y reembolso emitido",
    );
  }

  const FILTROS: { valor: ClaimStatus | "TODOS"; etiqueta: string }[] = [
    { valor: "OPEN", etiqueta: "Abiertos" },
    { valor: "INVESTIGATING", etiqueta: "En revisión" },
    { valor: "APPROVED", etiqueta: "Aprobados" },
    { valor: "SETTLED", etiqueta: "Liquidados" },
    { valor: "REJECTED", etiqueta: "Rechazados" },
    { valor: "TODOS", etiqueta: "Todos" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reclamos</h1>
        <p className="text-sm text-muted-foreground">
          Lo que el cliente reclama y qué se decidió. Las excepciones son lo que
          detecta la bodega; esto es lo que pregunta quien recibe.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sin decidir
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!resumen ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-semibold">{resumen.abiertos}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Reclamado y sin resolver
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!resumen ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <p className="text-3xl font-semibold">
                  {Number(resumen.reclamadoAbierto).toFixed(2)}
                </p>
                {/* Se dice explícitamente que no es una deuda: buena parte se
                    rechazará, y presentarlo como pasivo asusta sin motivo. */}
                <p className="text-xs text-muted-foreground">
                  Es lo que piden, no lo que se debe.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Button
            key={f.valor}
            size="sm"
            variant={filtro === f.valor ? "default" : "outline"}
            onClick={() => setFiltro(f.valor)}
          >
            {f.etiqueta}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          {!datos ? (
            <Skeleton className="h-40 w-full" />
          ) : datos.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay reclamos con este filtro.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reclamo</TableHead>
                    <TableHead>Envío</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Reclamado</TableHead>
                    <TableHead>Aprobado</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Abierto</TableHead>
                    <TableHead className="w-64" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datos.items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.number}</TableCell>
                      <TableCell>
                        {c.shipment ? (
                          <Link
                            href={`/shipments/${c.shipment.id}`}
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            {c.shipment.trackingNumber}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="block">{CLAIM_TYPE_LABELS[c.type]}</span>
                        <span className="block max-w-64 truncate text-xs text-muted-foreground">
                          {c.description}
                        </span>
                      </TableCell>
                      <TableCell>
                        {fmtDinero(c.claimedAmount, c.currency)}
                      </TableCell>
                      <TableCell>
                        {fmtDinero(c.approvedAmount, c.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge className={CLAIM_STATUS_CLASSES[c.status]}>
                          {CLAIM_STATUS_LABELS[c.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{fmtFecha(c.createdAt)}</TableCell>
                      <TableCell>
                        {/* Sólo se ofrece lo que la máquina de estados permite
                            desde donde está. Un botón que va a dar 400 es peor
                            que no tenerlo: parece que el sistema falla. */}
                        <div className="flex flex-wrap justify-end gap-1">
                          {c.status === "OPEN" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                accionar(
                                  `/claims/${c.id}/investigar`,
                                  {},
                                  "Reclamo en revisión",
                                )
                              }
                            >
                              Revisar
                            </Button>
                          )}
                          {(c.status === "OPEN" ||
                            c.status === "INVESTIGATING") && (
                            <>
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                  setDecision({ claim: c, accion: "aprobar" });
                                  setImporte(c.claimedAmount ?? "");
                                  setResolucion("");
                                }}
                              >
                                Aprobar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                  setDecision({ claim: c, accion: "rechazar" });
                                  setResolucion("");
                                }}
                              >
                                Rechazar
                              </Button>
                            </>
                          )}
                          {c.status === "APPROVED" && (
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => {
                                setLiquidando(c);
                                setPagoId("");
                              }}
                            >
                              Liquidar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!decision} onOpenChange={(v) => !v && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision?.accion === "aprobar"
                ? `Aprobar ${decision?.claim.number}`
                : `Rechazar ${decision?.claim.number}`}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onDecidir} className="space-y-4">
            {decision?.accion === "aprobar" && (
              <div className="space-y-2">
                <Label htmlFor="importe">
                  Importe aprobado ({decision.claim.currency})
                </Label>
                <Input
                  id="importe"
                  type="number"
                  step="0.01"
                  min="0"
                  value={importe}
                  onChange={(e) => setImporte(e.target.value)}
                  required
                />
                {/* Se muestra lo pedido al lado para que conceder el total sea
                    una decisión y no lo que pasa por no cambiar el campo. */}
                <p className="text-xs text-muted-foreground">
                  Pidió{" "}
                  {fmtDinero(
                    decision.claim.claimedAmount,
                    decision.claim.currency,
                  )}
                  .
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="resolucion">Motivo de la decisión</Label>
              <Textarea
                id="resolucion"
                value={resolucion}
                onChange={(e) => setResolucion(e.target.value)}
                minLength={10}
                required
                rows={3}
                placeholder="Qué se comprobó y por qué se decide así"
              />
              <p className="text-xs text-muted-foreground">
                Lo lee quien atienda la próxima llamada sobre este reclamo. Al
                cliente se le avisa de la decisión, no de este texto.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {decision?.accion === "aprobar" ? "Aprobar" : "Rechazar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!liquidando} onOpenChange={(v) => !v && setLiquidando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Liquidar {liquidando?.number}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onLiquidar} className="space-y-4">
            <p className="text-sm">
              Se emitirá un reembolso por{" "}
              <strong>
                {liquidando
                  ? fmtDinero(liquidando.approvedAmount, liquidando.currency)
                  : ""}
              </strong>
              .
            </p>
            <div className="space-y-2">
              <Label htmlFor="pago">Pago del que sale el dinero</Label>
              <Input
                id="pago"
                value={pagoId}
                onChange={(e) => setPagoId(e.target.value)}
                placeholder="Identificador del pago cobrado"
                required
              />
              {/* Se pide el pago concreto porque un envío puede tener varios
                  —el COD y el cobro de cargos— y devolver «del envío» sin decir
                  de cuál deja la caja sin cuadrar. */}
              <p className="text-xs text-muted-foreground">
                Lo encuentras en Pagos, en la fila del envío{" "}
                {liquidando?.shipment?.trackingNumber ?? ""}.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                Liquidar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
