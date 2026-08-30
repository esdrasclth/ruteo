"use client";

import { FormEvent, use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  LockerDetail,
  LockerPackage,
  Shipment,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import {
  LOCKER_STATUS_LABELS,
  PACKAGE_STATUS_LABELS,
  packageStatusBadgeClass,
} from "@/lib/logistics";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { NoExiste } from "@/components/no-existe";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const EMPTY_PREALERT = {
  externalTracking: "",
  merchant: "",
  description: "",
  weightKg: "",
  declaredValue: "",
};

export default function LockerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const [preOpen, setPreOpen] = useState(false);
  const [pre, setPre] = useState(EMPTY_PREALERT);

  const [consOpen, setConsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recipient, setRecipient] = useState({
    recipientName: "",
    recipientPhone: "",
    destinationLabel: "",
  });

  const { datos, error, recargar: load } = useApi<LockerDetail>(
    `/lockers/${id}`,
    {
    mensajeDeError: "Error cargando el casillero",
    // El 404 ya lo explica la pantalla entera; un aviso rojo encima sobra.
    silencioso: (e) => e.status === 404,
    },
  );
  // `?? null` para no cambiar el resto de la pantalla: antes esto era
  // `T | null` y `useApi` entrega `T | undefined`.
  const locker = datos ?? null;

  async function onPreAlert(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
    const str = (v: string) => (v.trim() === "" ? undefined : v.trim());
    try {
      await api(`/lockers/${id}/packages`, {
        method: "POST",
        body: JSON.stringify({
          externalTracking: str(pre.externalTracking),
          merchant: str(pre.merchant),
          description: str(pre.description),
          weightKg: num(pre.weightKg),
          declaredValue: num(pre.declaredValue),
        }),
      });
      toast.success("Paquete pre-alertado");
      setPreOpen(false);
      setPre(EMPTY_PREALERT);
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo pre-alertar",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onReceive(pkg: LockerPackage) {
    setBusy(true);
    try {
      await api(`/lockers/${id}/packages/${pkg.id}/receive`, {
        method: "PATCH",
      });
      toast.success("Paquete recibido en bodega");
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo recibir",
      );
    } finally {
      setBusy(false);
    }
  }

  function openConsolidate() {
    if (!locker) return;
    setSelected(new Set(received.map((p) => p.id)));
    setRecipient({
      recipientName: locker.customerName,
      recipientPhone: locker.customerPhone ?? "",
      destinationLabel: "",
    });
    setConsOpen(true);
  }

  async function onConsolidate(e: FormEvent) {
    e.preventDefault();
    if (selected.size === 0) {
      toast.error("Selecciona al menos un paquete");
      return;
    }
    setBusy(true);
    try {
      const shipment = await api<Shipment>("/consolidation", {
        method: "POST",
        body: JSON.stringify({
          lockerId: id,
          packageIds: [...selected],
          recipientName: recipient.recipientName.trim(),
          recipientPhone: recipient.recipientPhone.trim() || undefined,
          destinationLabel: recipient.destinationLabel.trim() || undefined,
        }),
      });
      toast.success(`Envío internacional creado: ${shipment.trackingNumber}`);
      router.push(`/shipments/${shipment.id}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo consolidar",
      );
      setBusy(false);
    }
  }

  // Un 404 no es «sigue cargando»: sin esto la pantalla se quedaba en
  // esqueleto para siempre, que es lo que peor se lee de todos los estados.
  if (error?.status === 404) {
    return (
      <NoExiste
        recurso="el casillero"
        volverA="/lockers"
        etiquetaVolver="Ver todos los casilleros"
      />
    );
  }

  if (!locker) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const received = locker.packages.filter((p) => p.status === "RECEIVED");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeader
          breadcrumbs={[
            { label: "Casilleros", href: "/lockers" },
            { label: locker.code },
          ]}
          title={<span className="font-mono">{locker.code}</span>}
          description={
            <>
              {/* El casillero conoce a su cliente: sin este salto hay que
                  copiar el nombre e ir a buscarlo a mano. */}
              {locker.customerId ? (
                <Link
                  href={`/customers/${locker.customerId}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {locker.customerName}
                </Link>
              ) : (
                locker.customerName
              )}
              {` · ${locker.addressLine1}, ${locker.city}, ${locker.state} ${locker.postalCode}`}
            </>
          }
        />
        <div className="flex items-center gap-2">
          <Badge
            className={
              locker.status === "ACTIVE"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }
          >
            {LOCKER_STATUS_LABELS[locker.status]}
          </Badge>
          <Button variant="outline" onClick={() => setPreOpen(true)}>
            <PackagePlus className="size-4" />
            Pre-alertar
          </Button>
          <Button
            disabled={received.length === 0}
            onClick={openConsolidate}
          >
            <Boxes className="size-4" />
            Consolidar ({received.length})
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <CardTitle className="text-base">
            Paquetes ({locker.packages.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {locker.packages.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Sin paquetes. Pre-alerta los paquetes que van en camino a la
              bodega.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guía externa</TableHead>
                  <TableHead>Comercio</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Peso (kg)</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locker.packages.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono">
                      {p.externalTracking ?? "—"}
                    </TableCell>
                    <TableCell>{p.merchant ?? "—"}</TableCell>
                    <TableCell className="max-w-48 truncate">
                      {p.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.weightKg ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.declaredValue
                        ? `${p.declaredValue} ${p.currency}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={packageStatusBadgeClass(p.status)}>
                        {PACKAGE_STATUS_LABELS[p.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {p.status === "PRE_ALERTED" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => onReceive(p)}
                        >
                          Recibir en bodega
                        </Button>
                      ) : p.shipmentId ? (
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/shipments/${p.shipmentId}`}>
                            Ver envío
                          </Link>
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

      <Dialog open={preOpen} onOpenChange={setPreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pre-alertar paquete</DialogTitle>
          </DialogHeader>
          <form onSubmit={onPreAlert} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="externalTracking">Guía del transportista</Label>
              <Input
                id="externalTracking"
                placeholder="1Z999AA10123456784"
                value={pre.externalTracking}
                onChange={(e) =>
                  setPre((f) => ({ ...f, externalTracking: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="merchant">Comercio</Label>
                <Input
                  id="merchant"
                  placeholder="Amazon"
                  value={pre.merchant}
                  onChange={(e) =>
                    setPre((f) => ({ ...f, merchant: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Descripción</Label>
                <Input
                  id="description"
                  value={pre.description}
                  onChange={(e) =>
                    setPre((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="weightKg">Peso (kg)</Label>
                <Input
                  id="weightKg"
                  type="number"
                  step="any"
                  min="0"
                  value={pre.weightKg}
                  onChange={(e) =>
                    setPre((f) => ({ ...f, weightKg: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="declaredValue">Valor (USD)</Label>
                <Input
                  id="declaredValue"
                  type="number"
                  step="any"
                  min="0"
                  value={pre.declaredValue}
                  onChange={(e) =>
                    setPre((f) => ({ ...f, declaredValue: e.target.value }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                Pre-alertar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={consOpen} onOpenChange={setConsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Consolidar en envío internacional</DialogTitle>
          </DialogHeader>
          <form onSubmit={onConsolidate} className="grid gap-4">
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium leading-none">
                Paquetes recibidos
              </legend>
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                {received.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={selected.has(p.id)}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(p.id);
                          else next.delete(p.id);
                          return next;
                        })
                      }
                    />
                    <span className="font-mono text-xs">
                      {p.externalTracking ?? p.id.slice(0, 8)}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {p.description ?? p.merchant ?? ""}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-2">
              <Label htmlFor="recipientName">Destinatario en HN *</Label>
              <Input
                id="recipientName"
                required
                value={recipient.recipientName}
                onChange={(e) =>
                  setRecipient((f) => ({
                    ...f,
                    recipientName: e.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="recipientPhone">Teléfono</Label>
                <Input
                  id="recipientPhone"
                  value={recipient.recipientPhone}
                  onChange={(e) =>
                    setRecipient((f) => ({
                      ...f,
                      recipientPhone: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="destinationLabel">Destino</Label>
                <Input
                  id="destinationLabel"
                  placeholder="Tegucigalpa, HN"
                  value={recipient.destinationLabel}
                  onChange={(e) =>
                    setRecipient((f) => ({
                      ...f,
                      destinationLabel: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy || selected.size === 0}>
                {busy
                  ? "Consolidando…"
                  : `Consolidar ${selected.size} paquete(s)`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
