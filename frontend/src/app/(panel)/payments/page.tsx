"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CreditCard, X } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  Driver,
  Payment,
  PaymentMethod,
  PaymentSummaryRow,
} from "@/lib/api";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_TYPE_LABELS,
  paymentStatusBadgeClass,
} from "@/lib/logistics";
import { Badge } from "@/components/ui/badge";
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
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_FILTERS = ["PENDING", "COLLECTED", "REMITTED", "CANCELLED"];
const TYPE_FILTERS = ["COD", "SUBSCRIPTION"];

// `useSearchParams` exige frontera Suspense para no romper el build estatico.
export default function PaymentsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
      <PaymentsContent />
    </Suspense>
  );
}

function PaymentsContent() {
  const searchParams = useSearchParams();
  // Llega desde el detalle de un envio: "ver los cobros de este envio".
  const shipmentId = searchParams.get("shipmentId");
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [summary, setSummary] = useState<PaymentSummaryRow[] | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [status, setStatus] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [busy, setBusy] = useState(false);

  const [collecting, setCollecting] = useState<Payment | null>(null);
  const [method, setMethod] = useState<string>("CASH");
  const [reference, setReference] = useState("");
  const [driverId, setDriverId] = useState<string>("NONE");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    if (type !== "ALL") params.set("type", type);
    if (shipmentId) params.set("shipmentId", shipmentId);
    const qs = params.toString();
    try {
      const [list, sum] = await Promise.all([
        api<Payment[]>(`/payments${qs ? `?${qs}` : ""}`),
        api<PaymentSummaryRow[]>("/payments/summary"),
      ]);
      setPayments(list);
      setSummary(sum);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error cargando pagos",
      );
    }
  }, [status, type, shipmentId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<Driver[]>("/drivers")
      .then(setDrivers)
      .catch(() => setDrivers([]));
  }, []);

  function openCollect(p: Payment) {
    setCollecting(p);
    setMethod("CASH");
    setReference("");
    setDriverId("NONE");
  }

  async function onCollect(e: FormEvent) {
    e.preventDefault();
    if (!collecting) return;
    setBusy(true);
    try {
      await api(`/payments/${collecting.id}/collect`, {
        method: "PATCH",
        body: JSON.stringify({
          method: method as PaymentMethod,
          reference: reference.trim() || undefined,
          collectedByDriverId: driverId === "NONE" ? undefined : driverId,
        }),
      });
      toast.success("Pago cobrado");
      setCollecting(null);
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo cobrar",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRemit(p: Payment) {
    setBusy(true);
    try {
      await api(`/payments/${p.id}/remit`, { method: "PATCH" });
      toast.success("Pago remitido");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo remitir",
      );
    } finally {
      setBusy(false);
    }
  }

  const summaryFor = (s: string) =>
    summary?.find((r) => r.status === s) ?? { count: 0, amount: "0" };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumbs={
          shipmentId
            ? [
                { label: "Envíos", href: "/shipments" },
                { label: "Envío", href: `/shipments/${shipmentId}` },
                { label: "Cobros" },
              ]
            : undefined
        }
        title="Pagos"
        description="Cobros contra entrega y suscripciones del período."
        actions={
          shipmentId ? (
            <Button variant="outline" size="sm" asChild>
              <Link href="/payments">
                <X className="size-4" />
                Quitar filtro de envío
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {["PENDING", "COLLECTED", "REMITTED"].map((s) => {
          const row = summaryFor(s);
          return (
            <Card key={s}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  COD {PAYMENT_STATUS_LABELS[s as Payment["status"]]}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summary ? (
                  <>
                    <p className="text-2xl font-semibold">{row.amount}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.count} pago(s)
                    </p>
                  </>
                ) : (
                  <Skeleton className="h-10" />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los estados</SelectItem>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {PAYMENT_STATUS_LABELS[s as Payment["status"]]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los tipos</SelectItem>
            {TYPE_FILTERS.map((t) => (
              <SelectItem key={t} value={t}>
                {PAYMENT_TYPE_LABELS[t as Payment["type"]]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          {!payments ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : payments.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="Sin pagos"
              description={
                shipmentId
                  ? "Este envío no tiene cobros registrados."
                  : "No hay pagos que coincidan con los filtros seleccionados."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Envío</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString("es-HN")}
                    </TableCell>
                    <TableCell>{PAYMENT_TYPE_LABELS[p.type]}</TableCell>
                    <TableCell>
                      {p.shipment && p.shipmentId ? (
                        <Link
                          href={`/shipments/${p.shipmentId}`}
                          className="font-mono text-xs underline-offset-2 hover:underline"
                        >
                          {p.shipment.trackingNumber}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {p.amount} {p.currency}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.method ? PAYMENT_METHOD_LABELS[p.method] : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={paymentStatusBadgeClass(p.status)}>
                        {PAYMENT_STATUS_LABELS[p.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {p.status === "PENDING" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => openCollect(p)}
                        >
                          Cobrar
                        </Button>
                      ) : p.status === "COLLECTED" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => onRemit(p)}
                        >
                          Remitir
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={collecting !== null}
        onOpenChange={(o) => !o && setCollecting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Cobrar {collecting?.amount} {collecting?.currency}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onCollect} className="grid gap-4">
            <div className="grid gap-2">
              <Label>Método</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reference">Referencia</Label>
              <Input
                id="reference"
                placeholder="Recibo #A-102"
                maxLength={120}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Cobrado por (driver)</Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Sin driver</SelectItem>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Cobrando…" : "Confirmar cobro"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
